import type { QuickPickItem } from 'vscode'
import type { GitUserProfile } from './gitUser'
import type { OpenTarget } from './project'

export interface ProjectPickItem extends QuickPickItem {
  target?: OpenTarget
}

export type ProfilePickAction = 'apply' | 'add' | 'settings'

export interface ProfilePickItem extends QuickPickItem {
  action?: ProfilePickAction
  profile?: GitUserProfile
}

export interface RepoPickItem extends QuickPickItem {
  repo: string
}
