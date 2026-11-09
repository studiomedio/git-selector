import { basename } from 'node:path'
import * as vscode from 'vscode'
import { appendGlobalSetting, getSettings } from './config'
import { samePath } from './paths'
import { findWorkspaceFiles } from './scanner'
import type { StateStore } from './state'

function singleLocalFolder(): string | undefined {
  if (vscode.workspace.workspaceFile) return undefined
  const folders = vscode.workspace.workspaceFolders
  return folders?.length === 1 && folders[0].uri.scheme === 'file'
    ? folders[0].uri.fsPath
    : undefined
}

async function pickWorkspaceFile(files: string[]): Promise<string | undefined> {
  if (files.length === 1) return files[0]
  const picked = await vscode.window.showQuickPick(
    files.map((file) => ({ label: `$(layers) ${basename(file)}`, file })),
    { placeHolder: 'Select the workspace to open' },
  )
  return picked?.file
}

function openWorkspace(file: string): Thenable<unknown> {
  return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(file), {
    forceNewWindow: false,
  })
}

/** Offers (or performs) switching a bare folder window to its `.code-workspace` file */
export async function autoOpenWorkspace(
  state: StateStore,
  log: vscode.LogOutputChannel,
): Promise<void> {
  const settings = getSettings()
  if (settings.autoOpenWorkspace === 'off') return
  const folder = singleLocalFolder()
  if (!folder) return
  if (settings.autoOpenWorkspaceExcludedFolders.some((p) => samePath(p, folder))) return
  if (await state.isAutoOpenSuppressed(folder)) {
    log.info(`Auto-open skipped for ${folder}: opened as folder from the picker`)
    return
  }

  const files = await findWorkspaceFiles(folder)
  if (!files.length) return

  if (settings.autoOpenWorkspace === 'always') {
    const file = await pickWorkspaceFile(files)
    if (file) await openWorkspace(file)
    return
  }

  const what = files.length === 1 ? basename(files[0]) : `${files.length} workspace files`
  const choice = await vscode.window.showInformationMessage(
    `This folder contains ${what}. Open the workspace instead?`,
    'Open Workspace',
    'Never for This Folder',
  )
  if (choice === 'Open Workspace') {
    const file = await pickWorkspaceFile(files)
    if (file) await openWorkspace(file)
  } else if (choice === 'Never for This Folder') {
    await appendGlobalSetting('autoOpenWorkspaceExcludedFolders', [folder])
  }
}

/** Command: open the workspace file of the folder open in this window */
export async function openWorkspaceOfCurrentFolder(): Promise<void> {
  const folder = singleLocalFolder()
  if (!folder) {
    void vscode.window.showInformationMessage(
      vscode.workspace.workspaceFile
        ? 'A workspace is already open.'
        : 'Open a single folder to use this command.',
    )
    return
  }
  const files = await findWorkspaceFiles(folder)
  if (!files.length) {
    void vscode.window.showInformationMessage('No .code-workspace file in this folder.')
    return
  }
  const file = await pickWorkspaceFile(files)
  if (file) await openWorkspace(file)
}
