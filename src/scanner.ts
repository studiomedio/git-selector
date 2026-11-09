import type { Dirent } from 'node:fs'
import { readdir, realpath } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { absolutePath, pathKey } from './paths'
import type { Project, ScanOptions } from './types/project'

export const WORKSPACE_EXTENSION = '.code-workspace'
const MAX_CONCURRENT_READS = 32

function workspaceFilesIn(dir: string, entries: Dirent[]): string[] {
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith(WORKSPACE_EXTENSION))
    .map((e) => join(dir, e.name))
    .sort((a, b) => a.localeCompare(b))
}

/** `*.code-workspace` files in the root of `dir` */
export async function findWorkspaceFiles(dir: string): Promise<string[]> {
  try {
    return workspaceFilesIn(dir, await readdir(dir, { withFileTypes: true }))
  } catch {
    return []
  }
}

function createLimiter(max: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    while (active >= max) await new Promise<void>((r) => waiting.push(r))
    active++
    try {
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

/**
 * Walks the base folders and returns every git repository and every folder that
 * contains a `.code-workspace` file, sorted by name.
 */
export async function scanProjects(options: ScanOptions): Promise<Project[]> {
  const found = new Map<string, Project>()
  const visited = new Set<string>()
  const ignoredNames = new Set(options.ignoredFolders.filter((f) => !/[\\/]/.test(f)))
  const ignoredPaths = new Set(
    options.ignoredFolders.filter((f) => /[\\/]/.test(f)).map((f) => pathKey(f)),
  )
  const limit = createLimiter(MAX_CONCURRENT_READS)

  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries: Dirent[]
    try {
      const real = await realpath(dir)
      if (visited.has(real)) return
      visited.add(real)
      entries = await limit(() => readdir(dir, { withFileTypes: true }))
    } catch {
      return
    }

    const isRepo = entries.some((e) => e.name === '.git')
    const workspaces = workspaceFilesIn(dir, entries)
    if (isRepo || workspaces.length > 0) {
      found.set(pathKey(dir), { name: basename(dir), path: dir, isRepo, workspaces })
    }

    if (isRepo && !options.searchInsideRepositories) return
    if (depth >= options.maxDepth) return

    const children = entries.filter(
      (e) =>
        (e.isDirectory() || e.isSymbolicLink()) &&
        !e.name.startsWith('.') &&
        !ignoredNames.has(e.name) &&
        !ignoredPaths.has(pathKey(join(dir, e.name))),
    )
    await Promise.all(children.map((e) => walk(join(dir, e.name), depth + 1)))
  }

  await Promise.all(options.baseFolders.map((folder) => walk(absolutePath(folder), 0)))

  return [...found.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.path.localeCompare(b.path),
  )
}
