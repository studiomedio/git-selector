import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'

const caseInsensitive = process.platform === 'darwin' || process.platform === 'win32'

export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/** Absolute, home-expanded path without trailing separator */
export function absolutePath(path: string): string {
  return resolve(expandHome(path.trim()))
}

/** Key for comparing paths (case-folded on case-insensitive platforms) */
export function pathKey(path: string): string {
  const abs = absolutePath(path)
  return caseInsensitive ? abs.toLowerCase() : abs
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

export function isInside(child: string, parent: string): boolean {
  const c = pathKey(child)
  const p = pathKey(parent)
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep)
}

export function tildify(path: string): string {
  const home = homedir()
  if (path === home) return '~'
  return path.startsWith(home + sep) ? '~' + path.slice(home.length) : path
}

/** `foo.code-workspace` -> `foo` */
export function workspaceName(file: string): string {
  return basename(file, extname(file))
}
