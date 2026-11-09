import type { Project } from './project'

export interface ProjectCache {
  scannedAt: number
  projects: Project[]
}

/** Paths of recently opened folders / workspace files, most recent first */
export type RecentList = string[]

/** Normalized folder path -> timestamp until which auto-open is suppressed */
export type AutoOpenSkipMarkers = Record<string, number>
