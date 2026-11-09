# Changelog

## 1.0.0

Initial release.

- **Open Project** (`⌥⌘P`) — every git repository and workspace-holding folder under
  `gitSelector.baseFolders`, with one extra entry per `.code-workspace` file
  (`gitSelector.preferWorkspace` lists it first), a Recent section that skips the current window,
  and a button to open in the other window. Cached list with background rescan.
- **Open Project in New Window** (`⌥⌘N`).
- **Auto-open workspace** — `ask`, `always` or `off` when a folder with a workspace file is opened;
  never triggered for a folder picked as a bare folder; **Never for This Folder** exclusions.
- **Open Workspace File of Current Folder**.
- **Git user profiles** — status bar indicator, **Switch Git User** (local or global), **Add Git User
  Profile…**, automatic profile by folder (`paths`), signing key support.
- One-time import of Git Project Manager's folder settings.
