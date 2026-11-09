import * as vscode from 'vscode'
import { autoOpenWorkspace, openWorkspaceOfCurrentFolder } from './autoOpen'
import { migrateLegacySettings } from './config'
import { GitUserController } from './gitUser'
import { ProjectPicker, ProjectService, currentWindowPath } from './projects'
import { StateStore } from './state'

const SCAN_SETTINGS = [
  'gitSelector.baseFolders',
  'gitSelector.maxDepth',
  'gitSelector.ignoredFolders',
  'gitSelector.searchInsideRepositories',
]

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Git Selector', { log: true })
  const state = new StateStore(context.globalStorageUri.fsPath)
  const projects = new ProjectService(state, log)
  const picker = new ProjectPicker(projects, state, log)
  const gitUser = new GitUserController(log)

  const command = (id: string, run: () => unknown) =>
    vscode.commands.registerCommand(id, async () => {
      try {
        await run()
      } catch (error) {
        log.error(`${id} failed`, error)
        void vscode.window.showErrorMessage(`Git Selector: ${String(error)}`)
      }
    })

  context.subscriptions.push(
    log,
    gitUser,
    command('gitSelector.openProject', () => picker.show()),
    command('gitSelector.openProjectNewWindow', () => picker.show(true)),
    command('gitSelector.refreshProjects', async () => {
      const list = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Scanning projects' },
        () => projects.refresh(),
      )
      void vscode.window.showInformationMessage(`Git Selector: found ${list.length} projects.`)
    }),
    command('gitSelector.addBaseFolder', () => picker.addBaseFolder()),
    command('gitSelector.openWorkspaceFile', () => openWorkspaceOfCurrentFolder()),
    command('gitSelector.switchGitUser', () => gitUser.switchUser()),
    command('gitSelector.addGitUserProfile', () => gitUser.addProfile()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (SCAN_SETTINGS.some((key) => event.affectsConfiguration(key))) {
        void projects.refresh().catch((error) => log.error('Project scan failed', error))
      }
    }),
  )

  // Record whatever this window opened (also via File > Open) so other windows list it as recent
  const current = currentWindowPath()
  if (current)
    void state.pushRecent(current).catch((error) => log.warn('Could not update recent list', error))

  void migrateLegacySettings(context.globalState, log).catch((error) =>
    log.warn('Could not import Git Project Manager settings', error),
  )
  void autoOpenWorkspace(state, log).catch((error) => log.error('Auto-open failed', error))
  void gitUser.init().catch((error) => log.error('Git user init failed', error))
}

export function deactivate(): void {}
