export interface GitUserProfile {
  label: string
  name: string
  email: string
  signingKey?: string
  /** Repositories under these folders get the profile automatically */
  paths?: string[]
}

/** Config scope reported by `git config --show-scope` (local, global, system, worktree, command) */
export type GitConfigScope = string

export interface GitIdentity {
  name?: string
  email?: string
  /** Scope the email comes from; undefined when no email is configured anywhere */
  scope?: GitConfigScope
}

export type ApplyScope = 'local' | 'global'
