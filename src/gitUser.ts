import { homedir } from 'node:os'
import { basename, dirname } from 'node:path'
import * as vscode from 'vscode'
import { SECTION, appendGlobalSetting, getGitPath, getSettings } from './config'
import { getRepoRoot, readIdentity, writeIdentity } from './git'
import { tildify } from './paths'
import { findProfileForIdentity, findProfileForPath, identityMatches } from './profiles'
import type { ApplyScope, GitIdentity, GitUserProfile } from './types/gitUser'
import type { ProfilePickItem, RepoPickItem } from './types/picker'

const GLOBAL_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('globe'),
  tooltip: 'Set as Global Git User',
}

export class GitUserController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private readonly disposables: vscode.Disposable[] = []
  /** workspace folder path -> repository root (undefined when not a repo) */
  private readonly roots = new Map<string, Promise<string | undefined>>()
  private refreshTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.item = vscode.window.createStatusBarItem(
      'gitSelector.gitUser',
      vscode.StatusBarAlignment.Left,
      0,
    )
    this.item.name = 'Git User'
    this.item.command = 'gitSelector.switchGitUser'

    this.disposables.push(
      this.item,
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.window.onDidChangeWindowState((state) => state.focused && this.scheduleRefresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.roots.clear()
        void this.autoApply().finally(() => this.scheduleRefresh())
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(`${SECTION}.gitUser`)) return
        void this.autoApply().finally(() => this.scheduleRefresh())
      }),
    )
  }

  async init(): Promise<void> {
    await this.autoApply()
    await this.refresh()
  }

  dispose(): void {
    clearTimeout(this.refreshTimer)
    this.disposables.forEach((d) => d.dispose())
  }

  private repoRoot(folder: string): Promise<string | undefined> {
    let root = this.roots.get(folder)
    if (!root) {
      root = getRepoRoot(getGitPath(), folder)
      this.roots.set(folder, root)
    }
    return root
  }

  /** Unique repository roots of all local workspace folders */
  private async repos(): Promise<string[]> {
    const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file')
    const roots = await Promise.all(folders.map((f) => this.repoRoot(f.uri.fsPath)))
    return [...new Set(roots.filter((r): r is string => r !== undefined))]
  }

  /** Repository of the active editor, falling back to the first repository */
  private async activeRepo(): Promise<string | undefined> {
    const uri = vscode.window.activeTextEditor?.document.uri
    const folder = uri && vscode.workspace.getWorkspaceFolder(uri)
    if (folder?.uri.scheme === 'file') {
      const root = await this.repoRoot(folder.uri.fsPath)
      if (root) return root
    }
    return (await this.repos())[0]
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), 150)
  }

  async refresh(): Promise<void> {
    const settings = getSettings()
    const repo = settings.gitUser.showStatusBar ? await this.activeRepo() : undefined
    if (!repo) {
      this.item.hide()
      return
    }
    try {
      const identity = await readIdentity(getGitPath(), repo)
      this.render(repo, identity, findProfileForIdentity(settings.gitUser.profiles, identity))
    } catch (error) {
      this.log.error(`Could not read git user for ${repo}`, error)
      this.item.hide()
    }
  }

  private render(repo: string, identity: GitIdentity, profile?: GitUserProfile): void {
    const missing = !identity.email
    this.item.text = `$(account) ${missing ? 'No git user' : (profile?.label ?? identity.email)}`
    this.item.backgroundColor = missing
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined

    const tooltip = new vscode.MarkdownString(undefined, true)
    tooltip.appendMarkdown(`**Git user** for \`${basename(repo)}\`\n\n`)
    if (missing) {
      tooltip.appendMarkdown('No `user.email` configured.\n\n')
    } else {
      tooltip.appendText(`${identity.name ?? '(no name)'} <${identity.email}>`)
      tooltip.appendMarkdown(`\n\nFrom ${identity.scope ?? 'unknown'} config`)
      if (profile) tooltip.appendMarkdown(` · profile **${profile.label}**`)
      tooltip.appendMarkdown('\n\n')
    }
    tooltip.appendMarkdown('$(arrow-swap) Click to switch')
    this.item.tooltip = tooltip
    this.item.show()
  }

  /** Writes the path-matched profile into each repo whose identity differs */
  async autoApply(): Promise<void> {
    const settings = getSettings().gitUser
    if (!settings.autoApply || !settings.profiles.some((p) => p.paths?.length)) return
    const gitPath = getGitPath()
    for (const repo of await this.repos()) {
      const profile = findProfileForPath(settings.profiles, repo)
      if (!profile) continue
      try {
        if (identityMatches(await readIdentity(gitPath, repo), profile)) continue
        await writeIdentity(gitPath, repo, profile, 'local')
        this.log.info(`Applied profile ${profile.label} to ${repo}`)
        void vscode.window.showInformationMessage(
          `Git user for ${basename(repo)} set to ${profile.label} (${profile.email}).`,
        )
      } catch (error) {
        this.log.error(`Could not apply profile ${profile.label} to ${repo}`, error)
      }
    }
  }

  async switchUser(): Promise<void> {
    const settings = getSettings().gitUser
    const repo = await this.activeRepo()
    const identity = repo
      ? await readIdentity(getGitPath(), repo).catch(() => undefined)
      : undefined

    const items: ProfilePickItem[] = settings.profiles.map((profile) => {
      const current = identity !== undefined && identityMatches(identity, profile)
      return {
        label: `${current ? '$(check)' : '$(account)'} ${profile.label}`,
        description: `${profile.name} <${profile.email}>`,
        detail: profile.paths?.length
          ? `Auto: ${profile.paths.map(tildify).join(', ')}`
          : undefined,
        action: 'apply',
        profile,
        buttons: [GLOBAL_BUTTON],
      }
    })
    items.push(
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      { label: '$(add) Add Profile…', action: 'add' },
      { label: '$(gear) Edit Profiles in Settings', action: 'settings' },
    )

    const picked = await new Promise<{ item: ProfilePickItem; global: boolean } | undefined>(
      (resolve) => {
        const picker = vscode.window.createQuickPick<ProfilePickItem>()
        picker.placeholder = repo
          ? `Git user for ${basename(repo)} — currently ${identity?.email ?? 'not set'}`
          : 'No repository open — the profile will be set globally'
        picker.matchOnDescription = true
        picker.items = items
        let result: { item: ProfilePickItem; global: boolean } | undefined
        picker.onDidAccept(() => {
          const item = picker.selectedItems[0]
          if (item) result = { item, global: false }
          picker.hide()
        })
        picker.onDidTriggerItemButton((event) => {
          result = { item: event.item, global: true }
          picker.hide()
        })
        picker.onDidHide(() => {
          picker.dispose()
          resolve(result)
        })
        picker.show()
      },
    )
    if (!picked) return

    switch (picked.item.action) {
      case 'add':
        await this.addProfile()
        return
      case 'settings':
        await vscode.commands.executeCommand('workbench.action.openSettingsJson', {
          revealSetting: { key: `${SECTION}.gitUser.profiles` },
        })
        return
      case 'apply':
        if (picked.item.profile)
          await this.apply(picked.item.profile, picked.global ? 'global' : 'local')
        return
    }
  }

  private async apply(profile: GitUserProfile, scope: ApplyScope): Promise<void> {
    const gitPath = getGitPath()
    const repos = await this.repos()
    if (!repos.length) scope = 'global'
    // Global config is written once, from any directory
    const targets =
      scope === 'global' ? [homedir()] : repos.length > 1 ? await this.pickRepos(repos) : repos
    if (!targets.length) return

    try {
      for (const repo of targets) await writeIdentity(gitPath, repo, profile, scope)
      const where =
        scope === 'global' ? 'globally' : `for ${targets.map((r) => basename(r)).join(', ')}`
      void vscode.window.showInformationMessage(
        `Git user set to ${profile.label} (${profile.email}) ${where}.`,
      )
    } catch (error) {
      this.log.error('Switching git user failed', error)
      void vscode.window.showErrorMessage(`Switching git user failed: ${String(error)}`)
    }
    await this.refresh()
  }

  private async pickRepos(repos: string[]): Promise<string[]> {
    const picked = await vscode.window.showQuickPick<RepoPickItem>(
      repos.map((repo) => ({
        label: basename(repo),
        description: tildify(repo),
        repo,
        picked: true,
      })),
      { canPickMany: true, placeHolder: 'Apply to which repositories?' },
    )
    return picked?.map((p) => p.repo) ?? []
  }

  async addProfile(): Promise<void> {
    const repo = await this.activeRepo()
    const identity = repo
      ? await readIdentity(getGitPath(), repo).catch(() => undefined)
      : undefined
    const steps = 'Add Git User Profile'

    const label = await vscode.window.showInputBox({
      title: `${steps} (1/4)`,
      prompt: 'Profile label shown in the status bar',
      placeHolder: 'e.g. Work, Personal',
      validateInput: (v) => (v.trim() ? undefined : 'Label is required'),
    })
    if (!label) return
    const name = await vscode.window.showInputBox({
      title: `${steps} (2/4)`,
      prompt: 'git user.name',
      value: identity?.name,
      validateInput: (v) => (v.trim() ? undefined : 'Name is required'),
    })
    if (!name) return
    const email = await vscode.window.showInputBox({
      title: `${steps} (3/4)`,
      prompt: 'git user.email',
      value: identity?.email,
      validateInput: (v) => (/^\S+@\S+$/.test(v.trim()) ? undefined : 'Enter a valid email'),
    })
    if (!email) return

    const choices: Array<vscode.QuickPickItem & { path?: string; browse?: boolean }> = [
      { label: 'No', description: 'Switch manually' },
    ]
    if (repo)
      choices.push({
        label: tildify(dirname(repo)),
        description: 'Parent folder of this repository',
        path: dirname(repo),
      })
    choices.push({ label: 'Choose Folder…', browse: true })
    const auto = await vscode.window.showQuickPick(choices, {
      title: `${steps} (4/4)`,
      placeHolder: 'Apply this profile automatically to repositories under a folder?',
    })
    if (!auto) return
    let path = auto.path
    if (auto.browse) {
      const uri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
      })
      path = uri?.[0]?.fsPath
    }

    const profile: GitUserProfile = { label: label.trim(), name: name.trim(), email: email.trim() }
    if (path) profile.paths = [tildify(path)]
    await appendGlobalSetting('gitUser.profiles', [profile])
    void vscode.window.showInformationMessage(`Profile ${profile.label} added.`)
    if (path) await this.autoApply()
    await this.refresh()
  }
}
