import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, before, test } from 'node:test'
import { findWorkspaceFiles, scanProjects } from '../src/scanner'
import type { ScanOptions } from '../src/types/project'

let root: string

async function repo(path: string, workspaces: string[] = []) {
  await mkdir(join(root, path, '.git'), { recursive: true })
  for (const ws of workspaces) await writeFile(join(root, path, ws), '{"folders":[{"path":"."}]}')
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'git-selector-'))
  await repo('alpha', ['alpha.code-workspace'])
  await repo('beta')
  await repo('beta/nested')
  await repo('group/gamma', ['b.code-workspace', 'a.code-workspace'])
  await repo('group/deep/deeper/too-deep')
  await repo('node_modules/ignored')
  await repo('.hidden/ignored')
  await mkdir(join(root, 'plain-folder/src'), { recursive: true })
  await mkdir(join(root, 'ws-only'), { recursive: true })
  await writeFile(join(root, 'ws-only', 'ws-only.code-workspace'), '{}')
  // Worktrees and submodules have a `.git` file instead of a directory
  await mkdir(join(root, 'worktree'), { recursive: true })
  await writeFile(join(root, 'worktree', '.git'), 'gitdir: /elsewhere')
  // A symlink loop must not hang the scan
  await symlink(root, join(root, 'group', 'loop'))
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

const options = (overrides: Partial<ScanOptions> = {}): ScanOptions => ({
  baseFolders: [root],
  maxDepth: 3,
  ignoredFolders: ['node_modules'],
  searchInsideRepositories: false,
  ...overrides,
})

const names = async (overrides?: Partial<ScanOptions>) =>
  (await scanProjects(options(overrides))).map((p) => p.name)

test('finds repos and workspace-only folders, sorted, skipping ignored, hidden and too deep ones', async () => {
  assert.deepEqual(await names(), ['alpha', 'beta', 'gamma', 'worktree', 'ws-only'])
})

test('collects sorted workspace files and marks folders without .git', async () => {
  const projects = await scanProjects(options())
  const byName = (name: string) => projects.find((p) => p.name === name)!
  assert.deepEqual(
    byName('gamma').workspaces.map((w) => basename(w)),
    ['a.code-workspace', 'b.code-workspace'],
  )
  assert.equal(byName('ws-only').isRepo, false)
  assert.equal(byName('worktree').isRepo, true)
})

test('searchInsideRepositories finds nested repos; maxDepth limits the walk', async () => {
  const found = await names({ searchInsideRepositories: true, maxDepth: 4 })
  assert.ok(found.includes('nested'))
  assert.ok(found.includes('too-deep'))
})

test('ignores absolute paths and missing base folders', async () => {
  const found = await names({
    baseFolders: [root, join(root, 'does-not-exist')],
    ignoredFolders: ['node_modules', join(root, 'group')],
  })
  assert.ok(!found.includes('gamma'))
  assert.ok(found.includes('alpha'))
})

test('findWorkspaceFiles lists root workspace files only', async () => {
  assert.deepEqual(await findWorkspaceFiles(join(root, 'alpha')), [
    join(root, 'alpha', 'alpha.code-workspace'),
  ])
  assert.deepEqual(await findWorkspaceFiles(join(root, 'beta')), [])
  assert.deepEqual(await findWorkspaceFiles(join(root, 'missing')), [])
})
