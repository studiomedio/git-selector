# Git Selector — VS Code extension

One small VS Code extension that combines three features below, so you don't need to install three
separate extensions:

- fast project switcher that also lists each repository's `.code-workspace` files,
- offer to open the workspace file when a bare folder is opened,
- git user profiles: status bar indicator, quick switch, automatic per-folder identity.

**Fast on big folders.** Your projects folders are scanned in parallel (about 50 repositories in under
10 ms), the list is cached and shown instantly, and a background rescan updates it in place. No
runtime dependencies, no telemetry.

## Features

### Project switcher

- **Open Project** (`⌥⌘P` on macOS, `Ctrl+Alt+P` elsewhere) lists every git repository — and every
  folder holding a `.code-workspace` file — under `gitSelector.baseFolders`.
- **Workspace entries** — a repository with workspace files gets one extra entry per file, marked
  `workspace` in the description. Type `workspace` to list only those. With
  `gitSelector.preferWorkspace` (default) the workspace comes before the bare folder, so Enter opens
  the workspace.
- **Recent** projects are listed first. The current window is left out, so `⌥⌘P` → `Enter` jumps
  back to the previous project.
- **Open Project in New Window** (`⌥⌘N` / `Ctrl+Alt+N`), or the window button on any entry, opens it
  the other way (new window ↔ this window).
- Worktrees and submodules (`.git` file) are recognised; hidden folders, `node_modules` and the
  like are skipped; symlinked folders are followed without loops.

**Coming from Git Project Manager?** On first start, `gitProjectManager.baseProjectsFolders`,
`ignoredFolders` and `maxDepthRecursion` are copied into the `gitSelector.*` settings (when
`gitSelector.baseFolders` is not set yet), so there is nothing to configure. Disable Git Project
Manager afterwards — both use `⌥⌘P`.

### Auto-open workspace

When a single folder containing a `.code-workspace` file is opened, `gitSelector.autoOpenWorkspace`
decides:

- `ask` (default) — a notification with **Open Workspace** and **Never for This Folder**;
- `always` — open it directly (you pick one if there are several);
- `off`.

Choosing the bare folder entry in the project picker never triggers it. **Open Workspace File of
Current Folder** does the same on demand.

### Git user profiles

- **Status bar** — the git identity of the active editor's repository: the profile label, or the
  email when no profile matches. A warning background means no `user.email` is configured.
- **Switch Git User** — click the status bar item to pick a profile; it is written to the
  repository's local git config. The globe button on a profile sets it globally instead. In a
  multi-root workspace you choose which repositories to update.
- **Automatic by folder** — a profile with `paths` is applied to every repository under those
  folders when it is opened (the most specific path wins). A stale local `user.signingkey` is
  removed when the new profile has none, so commits are never signed with the previous identity.
- **Add Git User Profile…** walks you through label, name, email and an optional folder.

```json
"gitSelector.gitUser.profiles": [
  { "label": "Personal", "name": "Jane Doe", "email": "jane@example.com", "paths": ["~/dev"] },
  { "label": "Work", "name": "Jane Doe", "email": "jane@company.com", "paths": ["~/dev-company"], "signingKey": "ABC123" }
]
```

All commands are in the Command Palette under **Git Selector:**.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `gitSelector.baseFolders` | `[]` | Folders to scan (`~` allowed) |
| `gitSelector.maxDepth` | `4` | Levels scanned below each base folder |
| `gitSelector.ignoredFolders` | `node_modules`, `bower_components`, `vendor`, `Pods` | Folder names or absolute paths to skip; hidden folders are always skipped |
| `gitSelector.searchInsideRepositories` | `false` | Also look for repositories nested inside repositories |
| `gitSelector.openInNewWindow` | `false` | Open picked projects in a new window by default |
| `gitSelector.preferWorkspace` | `true` | List workspace entries before the bare folder |
| `gitSelector.recentLimit` | `5` | Size of the Recent section |
| `gitSelector.autoOpenWorkspace` | `ask` | `ask`, `always` or `off` |
| `gitSelector.autoOpenWorkspaceExcludedFolders` | `[]` | Folders that are never redirected to their workspace |
| `gitSelector.gitUser.profiles` | `[]` | Git identities (see above) |
| `gitSelector.gitUser.autoApply` | `true` | Apply profiles by `paths` |
| `gitSelector.gitUser.showStatusBar` | `true` | Show the git user in the status bar |

## Keybindings

Git Selector binds `⌥⌘P` / `Ctrl+Alt+P` (Open Project) and `⌥⌘N` / `Ctrl+Alt+N` (Open Project in
New Window). A shortcut for switching the git user, for example:

```json
[{ "key": "ctrl+alt+u", "command": "gitSelector.switchGitUser" }]
```

## Development

```bash
npm install
npm run watch              # rebuild on change; press F5 to launch the Extension Development Host
npm run typecheck
npm test                   # unit tests (scanner, paths, profiles — plain Node)
npm run test:integration   # end-to-end in a downloaded VS Code (cached in .vscode-test/)
npm run package            # -> git-selector-<version>.vsix
```

`src/scanner.ts`, `src/paths.ts`, `src/profiles.ts` and `src/git.ts` have no `vscode` import
(unit-tested); `src/projects.ts`, `src/autoOpen.ts` and `src/gitUser.ts` wire them into the editor.
See [PUBLISHING.md](PUBLISHING.md) for releases.

## License

MIT
