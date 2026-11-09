import { absolutePath, isInside } from './paths'
import type { GitIdentity, GitUserProfile } from './types/gitUser'

/** Profile whose `paths` contain `repoPath`; the most specific (longest) path wins */
export function findProfileForPath(
  profiles: GitUserProfile[],
  repoPath: string,
): GitUserProfile | undefined {
  let best: { profile: GitUserProfile; length: number } | undefined
  for (const profile of profiles) {
    for (const path of profile.paths ?? []) {
      if (!path.trim() || !isInside(repoPath, path)) continue
      const length = absolutePath(path).length
      if (!best || length > best.length) best = { profile, length }
    }
  }
  return best?.profile
}

export function identityMatches(identity: GitIdentity, profile: GitUserProfile): boolean {
  return (
    identity.name === profile.name && identity.email?.toLowerCase() === profile.email.toLowerCase()
  )
}

export function findProfileForIdentity(
  profiles: GitUserProfile[],
  identity: GitIdentity,
): GitUserProfile | undefined {
  return (
    profiles.find((p) => identityMatches(identity, p)) ??
    profiles.find((p) => identity.email?.toLowerCase() === p.email.toLowerCase())
  )
}
