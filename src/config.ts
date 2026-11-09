import * as vscode from 'vscode'
import type { GitUserProfile } from './types/gitUser'
import type { AutoOpenMode, Settings } from './types/settings'

export const SECTION = 'gitSelector'

export function getSettings(): Settings {
  const config = vscode.workspace.getConfiguration(SECTION)
  return {
    scan: {
      baseFolders: config.get<string[]>('baseFolders', []),
      maxDepth: config.get<number>('maxDepth', 4),
      ignoredFolders: config.get<string[]>('ignoredFolders', []),
      searchInsideRepositories: config.get<boolean>('searchInsideRepositories', false),
    },
    openInNewWindow: config.get<boolean>('openInNewWindow', false),
    preferWorkspace: config.get<boolean>('preferWorkspace', true),
    recentLimit: config.get<number>('recentLimit', 5),
    autoOpenWorkspace: config.get<AutoOpenMode>('autoOpenWorkspace', 'ask'),
    autoOpenWorkspaceExcludedFolders: config.get<string[]>('autoOpenWorkspaceExcludedFolders', []),
    gitUser: {
      profiles: config
        .get<GitUserProfile[]>('gitUser.profiles', [])
        .filter((p) => p && p.label && p.name && p.email),
      autoApply: config.get<boolean>('gitUser.autoApply', true),
      showStatusBar: config.get<boolean>('gitUser.showStatusBar', true),
    },
  }
}

/** Appends values to a user-level (global) array setting */
export async function appendGlobalSetting<T>(key: string, values: T[]): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION)
  const current = config.inspect<T[]>(key)?.globalValue ?? []
  await config.update(key, [...current, ...values], vscode.ConfigurationTarget.Global)
}

const MIGRATED_KEY = 'migratedFromGitProjectManager'

/**
 * Copies Git Project Manager's folder settings into gitSelector.* once, when
 * gitSelector.baseFolders has not been set yet.
 */
export async function migrateLegacySettings(
  globalState: vscode.Memento,
  log: vscode.LogOutputChannel,
): Promise<void> {
  if (globalState.get<boolean>(MIGRATED_KEY)) return
  const config = vscode.workspace.getConfiguration(SECTION)
  const legacy = vscode.workspace.getConfiguration('gitProjectManager')
  const legacyFolders = legacy.inspect<string[]>('baseProjectsFolders')?.globalValue ?? []
  const own = config.inspect<string[]>('baseFolders')?.globalValue ?? []

  if (legacyFolders.length && !own.length) {
    const global = vscode.ConfigurationTarget.Global
    await config.update('baseFolders', legacyFolders, global)

    const ignored = config.get<string[]>('ignoredFolders', [])
    const extraIgnored = (legacy.inspect<string[]>('ignoredFolders')?.globalValue ?? []).filter(
      (f) => !ignored.includes(f),
    )
    if (extraIgnored.length)
      await config.update('ignoredFolders', [...ignored, ...extraIgnored], global)

    const depth = legacy.inspect<number>('maxDepthRecursion')?.globalValue
    if (depth !== undefined && config.inspect<number>('maxDepth')?.globalValue === undefined) {
      await config.update('maxDepth', depth, global)
    }

    log.info(`Imported Git Project Manager folders: ${legacyFolders.join(', ')}`)
    void vscode.window.showInformationMessage(
      `Git Selector imported ${legacyFolders.length} projects folder(s) from Git Project Manager.`,
    )
  }
  await globalState.update(MIGRATED_KEY, true)
}

export function getGitPath(): string {
  const configured = vscode.workspace.getConfiguration('git').get<string | string[] | null>('path')
  if (Array.isArray(configured)) return configured[0] ?? 'git'
  return configured || 'git'
}
