import type { GitUserProfile } from './gitUser'
import type { ScanOptions } from './project'

export type AutoOpenMode = 'ask' | 'always' | 'off'

export interface Settings {
  scan: ScanOptions
  openInNewWindow: boolean
  preferWorkspace: boolean
  recentLimit: number
  autoOpenWorkspace: AutoOpenMode
  autoOpenWorkspaceExcludedFolders: string[]
  gitUser: {
    profiles: GitUserProfile[]
    autoApply: boolean
    showStatusBar: boolean
  }
}
