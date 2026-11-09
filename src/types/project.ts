export interface Project {
  /** Folder name, used as the display label */
  name: string
  /** Absolute folder path */
  path: string
  /** True when the folder contains `.git` (directory or worktree file) */
  isRepo: boolean
  /** Absolute paths of `*.code-workspace` files in the folder root */
  workspaces: string[]
}

export type TargetKind = 'folder' | 'workspace'

/** Something that can be opened in a window: a project folder or one of its workspace files */
export interface OpenTarget {
  kind: TargetKind
  path: string
  project: Project
}

export interface ScanOptions {
  baseFolders: string[]
  maxDepth: number
  ignoredFolders: string[]
  searchInsideRepositories: boolean
}
