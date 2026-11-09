import { existsSync } from 'node:fs'
import * as vscode from 'vscode'
import { SECTION, getSettings } from './config'
import { pathKey, samePath, tildify, workspaceName } from './paths'
import { scanProjects } from './scanner'
import type { StateStore } from './state'
import type { ProjectPickItem } from './types/picker'
import type { OpenTarget, Project } from './types/project'
import type { Settings } from './types/settings'

/** Rescans triggered by opening the picker are skipped if the list is fresher than this */
const RESCAN_AFTER_MS = 30 * 1000

export class ProjectService {
  private scanning?: Promise<Project[]>
  private lastScan = 0

  constructor(
    private readonly state: StateStore,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  async cached(): Promise<Project[] | undefined> {
    const cache = await this.state.readProjects()
    if (cache && Array.isArray(cache.projects)) {
      this.lastScan = Math.max(this.lastScan, cache.scannedAt)
      return cache.projects
    }
    return undefined
  }

  isFresh(): boolean {
    return Date.now() - this.lastScan < RESCAN_AFTER_MS
  }

  refresh(): Promise<Project[]> {
    this.scanning ??= this.scan().finally(() => {
      this.scanning = undefined
    })
    return this.scanning
  }

  private async scan(): Promise<Project[]> {
    const options = getSettings().scan
    const started = Date.now()
    const projects = await scanProjects(options)
    this.lastScan = Date.now()
    this.log.info(
      `Scanned ${options.baseFolders.join(', ')}: ${projects.length} projects in ${this.lastScan - started} ms`,
    )
    await this.state.writeProjects({ scannedAt: this.lastScan, projects })
    return projects
  }
}

/** Path of what is open in this window: the workspace file or the single folder */
export function currentWindowPath(): string | undefined {
  const file = vscode.workspace.workspaceFile
  if (file) return file.scheme === 'file' ? file.fsPath : undefined
  const folders = vscode.workspace.workspaceFolders
  return folders?.length === 1 && folders[0].uri.scheme === 'file'
    ? folders[0].uri.fsPath
    : undefined
}

function targetsFor(project: Project, preferWorkspace: boolean): OpenTarget[] {
  const folder: OpenTarget = { kind: 'folder', path: project.path, project }
  const workspaces = project.workspaces.map<OpenTarget>((path) => ({
    kind: 'workspace',
    path,
    project,
  }))
  return preferWorkspace ? [...workspaces, folder] : [folder, ...workspaces]
}

function toItem(
  target: OpenTarget,
  current: string | undefined,
  newWindow: boolean,
): ProjectPickItem {
  const { project } = target
  const icon = target.kind === 'workspace' ? '$(layers)' : project.isRepo ? '$(repo)' : '$(folder)'
  const parts: string[] = []
  if (target.kind === 'workspace') {
    const name = workspaceName(target.path)
    parts.push(name === project.name ? 'workspace' : `workspace: ${name}`)
  }
  parts.push(tildify(project.path))
  if (current && samePath(current, target.path)) parts.push('current')

  return {
    label: `${icon} ${project.name}`,
    description: parts.join(' · '),
    target,
    buttons: [
      {
        iconPath: new vscode.ThemeIcon(newWindow ? 'window' : 'empty-window'),
        tooltip: newWindow ? 'Open in This Window' : 'Open in New Window',
      },
    ],
  }
}

function buildItems(
  projects: Project[],
  recent: string[],
  settings: Settings,
  newWindow: boolean,
): ProjectPickItem[] {
  const current = currentWindowPath()
  const targets = projects.flatMap((p) => targetsFor(p, settings.preferWorkspace))
  const byKey = new Map(targets.map((t) => [pathKey(t.path), t]))

  // The current window is left out of "Recent" so Enter jumps back to the previous project
  const recentTargets = recent
    .filter((p) => !current || !samePath(p, current))
    .map((p) => byKey.get(pathKey(p)))
    .filter((t): t is OpenTarget => t !== undefined)
    .slice(0, settings.recentLimit)
  const recentKeys = new Set(recentTargets.map((t) => pathKey(t.path)))

  const items: ProjectPickItem[] = []
  if (recentTargets.length) {
    items.push({ label: 'Recent', kind: vscode.QuickPickItemKind.Separator })
    items.push(...recentTargets.map((t) => toItem(t, current, newWindow)))
    items.push({ label: 'Projects', kind: vscode.QuickPickItemKind.Separator })
  }
  items.push(
    ...targets
      .filter((t) => !recentKeys.has(pathKey(t.path)))
      .map((t) => toItem(t, current, newWindow)),
  )
  return items
}

export class ProjectPicker {
  constructor(
    private readonly projects: ProjectService,
    private readonly state: StateStore,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  async show(forceNewWindow?: boolean): Promise<void> {
    const settings = getSettings()
    if (settings.scan.baseFolders.length === 0) {
      await this.promptForBaseFolders()
      return
    }
    const newWindow = forceNewWindow ?? settings.openInNewWindow

    const picker = vscode.window.createQuickPick<ProjectPickItem>()
    picker.placeholder = newWindow
      ? 'Open project in new window (type "workspace" to list workspace files only)'
      : 'Open project (type "workspace" to list workspace files only)'
    picker.matchOnDescription = true

    let disposed = false
    let signature = ''
    const [cached, recent] = await Promise.all([this.projects.cached(), this.state.readRecent()])

    const render = (projects: Project[]) => {
      const next = JSON.stringify(projects)
      if (disposed || next === signature) return
      signature = next
      const activePath = picker.activeItems[0]?.target?.path
      picker.items = buildItems(projects, recent, settings, newWindow)
      const active = activePath && picker.items.find((i) => i.target?.path === activePath)
      if (active) picker.activeItems = [active]
    }

    picker.onDidAccept(() => {
      const target = picker.selectedItems[0]?.target
      if (!target) return
      picker.hide()
      void this.open(target, newWindow)
    })
    picker.onDidTriggerItemButton((event) => {
      if (!event.item.target) return
      picker.hide()
      void this.open(event.item.target, !newWindow)
    })
    picker.onDidHide(() => {
      disposed = true
      picker.dispose()
    })

    if (cached) render(cached)
    picker.show()

    if (!cached || !this.projects.isFresh()) {
      picker.busy = true
      this.projects
        .refresh()
        .then(render)
        .catch((error) => this.log.error('Project scan failed', error))
        .finally(() => {
          if (!disposed) picker.busy = false
        })
    }
  }

  async open(target: OpenTarget, newWindow: boolean): Promise<void> {
    if (!existsSync(target.path)) {
      void vscode.window.showWarningMessage(`${tildify(target.path)} no longer exists.`)
      void this.projects.refresh()
      return
    }
    const current = currentWindowPath()
    if (!newWindow && current && samePath(current, target.path)) return

    try {
      await this.state.pushRecent(target.path)
      if (target.kind === 'folder' && target.project.workspaces.length) {
        await this.state.suppressAutoOpen(target.path)
      }
    } catch (error) {
      this.log.warn('Could not update state', error)
    }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target.path), {
      forceNewWindow: newWindow,
    })
  }

  async promptForBaseFolders(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      'Git Selector: no projects folders configured yet.',
      'Add Folder…',
      'Open Settings',
    )
    if (choice === 'Add Folder…') await this.addBaseFolder()
    if (choice === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'gitSelector.baseFolders',
      )
    }
  }

  async addBaseFolder(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: 'Add Projects Folder',
    })
    if (!picked?.length) return
    const config = vscode.workspace.getConfiguration(SECTION)
    const merged = [...(config.inspect<string[]>('baseFolders')?.globalValue ?? [])]
    for (const uri of picked) {
      if (!merged.some((p) => samePath(p, uri.fsPath))) merged.push(uri.fsPath)
    }
    await config.update('baseFolders', merged, vscode.ConfigurationTarget.Global)
    this.log.info(`Base folders: ${merged.join(', ')}`)
    await this.projects.refresh()
  }
}
