import { execFile } from 'node:child_process'
import type { ApplyScope, GitIdentity, GitUserProfile } from './types/gitUser'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(gitPath: string, args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      args,
      { cwd, timeout: 10_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error)
          return
        }
        resolve({ code: error ? Number(error.code) : 0, stdout, stderr })
      },
    )
  })
}

async function gitOrThrow(gitPath: string, args: string[], cwd: string): Promise<string> {
  const result = await runGit(gitPath, args, cwd)
  if (result.code !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.stderr.trim() || `exit ${result.code}`}`,
    )
  }
  return result.stdout
}

export async function getRepoRoot(gitPath: string, cwd: string): Promise<string | undefined> {
  try {
    const result = await runGit(gitPath, ['rev-parse', '--show-toplevel'], cwd)
    return result.code === 0 ? result.stdout.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

/** Parses `git config --show-scope --get` output: `<scope>\t<value>` */
export function parseScopedValue(stdout: string): { scope?: string; value?: string } {
  const line = stdout.trim()
  if (!line) return {}
  const tab = line.indexOf('\t')
  return tab < 0 ? { value: line } : { scope: line.slice(0, tab), value: line.slice(tab + 1) }
}

export async function readIdentity(gitPath: string, repo: string): Promise<GitIdentity> {
  const [name, email] = await Promise.all(
    ['user.name', 'user.email'].map(async (key) =>
      parseScopedValue(
        (await runGit(gitPath, ['config', '--show-scope', '--get', key], repo)).stdout,
      ),
    ),
  )
  return { name: name.value, email: email.value, scope: email.scope }
}

export async function writeIdentity(
  gitPath: string,
  repo: string,
  profile: GitUserProfile,
  scope: ApplyScope,
): Promise<void> {
  const flag = `--${scope}`
  await gitOrThrow(gitPath, ['config', flag, 'user.name', profile.name], repo)
  await gitOrThrow(gitPath, ['config', flag, 'user.email', profile.email], repo)
  if (profile.signingKey) {
    await gitOrThrow(gitPath, ['config', flag, 'user.signingkey', profile.signingKey], repo)
  } else if (scope === 'local') {
    // A stale local key would sign commits with the previous identity; exit code 5 = not set
    const result = await runGit(gitPath, ['config', '--local', '--unset', 'user.signingkey'], repo)
    if (result.code !== 0 && result.code !== 5) {
      throw new Error(`git config --unset user.signingkey failed: ${result.stderr.trim()}`)
    }
  }
}
