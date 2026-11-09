import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathKey } from './paths'
import type { AutoOpenSkipMarkers, ProjectCache, RecentList } from './types/state'

const RECENT_MAX = 30
const SKIP_AUTO_OPEN_MS = 10 * 60 * 1000

/**
 * Small JSON file store. Files (not globalState) are used so that a window opened
 * a moment ago immediately sees what the previous window wrote.
 */
class JsonFile<T> {
  constructor(
    private readonly file: string,
    private readonly fallback: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as T
    } catch {
      return this.fallback()
    }
  }

  async write(value: T): Promise<void> {
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(value), 'utf8')
    await rename(tmp, this.file)
  }
}

export class StateStore {
  private readonly ready: Promise<unknown>
  private readonly projects: JsonFile<ProjectCache | undefined>
  private readonly recent: JsonFile<RecentList>
  private readonly skip: JsonFile<AutoOpenSkipMarkers>

  constructor(dir: string) {
    this.ready = mkdir(dir, { recursive: true })
    this.projects = new JsonFile(join(dir, 'projects.json'), () => undefined)
    this.recent = new JsonFile(join(dir, 'recent.json'), () => [])
    this.skip = new JsonFile(join(dir, 'skip-auto-open.json'), () => ({}))
  }

  async readProjects(): Promise<ProjectCache | undefined> {
    await this.ready
    return this.projects.read()
  }

  async writeProjects(cache: ProjectCache): Promise<void> {
    await this.ready
    await this.projects.write(cache)
  }

  async readRecent(): Promise<RecentList> {
    await this.ready
    const list = await this.recent.read()
    return Array.isArray(list) ? list : []
  }

  async pushRecent(path: string): Promise<void> {
    const key = pathKey(path)
    const list = (await this.readRecent()).filter((p) => pathKey(p) !== key)
    await this.recent.write([path, ...list].slice(0, RECENT_MAX))
  }

  /** Called before opening a bare folder from the picker so auto-open leaves it alone */
  async suppressAutoOpen(folder: string): Promise<void> {
    await this.ready
    const now = Date.now()
    const markers = Object.fromEntries(
      Object.entries(await this.skip.read()).filter(([, until]) => until > now),
    )
    markers[pathKey(folder)] = now + SKIP_AUTO_OPEN_MS
    await this.skip.write(markers)
  }

  async isAutoOpenSuppressed(folder: string): Promise<boolean> {
    await this.ready
    const until = (await this.skip.read())[pathKey(folder)]
    return typeof until === 'number' && until > Date.now()
  }
}
