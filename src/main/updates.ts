import { createHash } from 'crypto'
import { isNewer } from './version'

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string; action: 'restart' | 'open' }
  | { kind: 'error'; message: string }

/** The part of electron-updater's autoUpdater this uses; installs in place on Windows and from an AppImage. */
export interface Installer {
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown
  on(event: 'update-not-available', listener: () => void): unknown
  on(event: 'download-progress', listener: (p: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
}

export interface Release {
  tag_name?: unknown
  assets?: { name?: unknown; browser_download_url?: unknown }[]
}

export interface UpdateDeps {
  version: string
  /** Installs in place when given; otherwise the new installer is downloaded, checked and opened. */
  installer?: Installer
  /** File extension of this platform's installer, e.g. '.dmg', for the download-and-open path. */
  assetExt: string
  latestRelease(): Promise<Release>
  fetchText(url: string): Promise<string>
  download(url: string, onProgress: (percent: number) => void): Promise<Buffer>
  save(name: string, data: Buffer): Promise<string>
  open(path: string): Promise<void>
  onChange(state: UpdateState): void
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

export class Updates {
  state: UpdateState = { kind: 'idle' }
  /** Whether the person asked for the current check; quiet checks only speak up when there is an update. */
  manual = false
  private busy = false
  private file: string | null = null

  constructor(private deps: UpdateDeps) {
    const i = deps.installer
    if (!i) return
    i.on('update-available', (info) => this.set({ kind: 'downloading', version: info.version, percent: 0 }))
    i.on('update-not-available', () => this.set({ kind: 'current', version: deps.version }))
    i.on('download-progress', (p) => {
      if (this.state.kind === 'downloading') this.set({ ...this.state, percent: Math.round(p.percent) })
    })
    i.on('update-downloaded', (info) => this.set({ kind: 'ready', version: info.version, action: 'restart' }))
    i.on('error', (err) => this.fail(err))
  }

  async check(manual: boolean): Promise<void> {
    // A download in progress or waiting for a restart is the answer to any further check.
    if (this.busy || this.state.kind === 'downloading' || this.state.kind === 'ready') {
      if (manual) this.manual = true
      return this.deps.onChange(this.state)
    }
    this.busy = true
    this.manual = manual
    this.set({ kind: 'checking' })
    try {
      if (this.deps.installer) await this.deps.installer.checkForUpdates()
      else await this.downloadAndVerify()
    } catch (err) {
      this.fail(err)
    } finally {
      this.busy = false
    }
  }

  async apply(): Promise<void> {
    if (this.state.kind !== 'ready') return
    // Silent, and Notes opens again once the new version is in place.
    if (this.state.action === 'restart') return this.deps.installer?.quitAndInstall(true, true)
    if (this.file) await this.deps.open(this.file)
  }

  private async downloadAndVerify(): Promise<void> {
    const release = await this.deps.latestRelease()
    const version = text(release.tag_name).replace(/^v/, '')
    if (!isNewer(version, this.deps.version)) return this.set({ kind: 'current', version: this.deps.version })
    const assets = (release.assets ?? []).map((a) => ({ name: text(a.name), url: text(a.browser_download_url) }))
    const asset = assets.find((a) => a.name.endsWith(this.deps.assetExt))
    const sums = assets.find((a) => a.name === 'SHA256SUMS')
    if (!asset?.url) throw new Error(`Notes ${version} has no ${this.deps.assetExt} download`)
    // The release lists every file's SHA-256; a file that can't be checked is never opened.
    if (!sums?.url) throw new Error(`Notes ${version} has no checksums, so its download can't be verified`)
    const expected = (await this.deps.fetchText(sums.url))
      .split('\n')
      .map((l) => l.trim().split(/\s+\*?/))
      .find(([, name]) => name === asset.name)?.[0]
    this.set({ kind: 'downloading', version, percent: 0 })
    const data = await this.deps.download(asset.url, (percent) => this.set({ kind: 'downloading', version, percent: Math.round(percent) }))
    if (!expected || createHash('sha256').update(data).digest('hex') !== expected.toLowerCase()) {
      throw new Error(`The download of Notes ${version} did not match its checksum`)
    }
    this.file = await this.deps.save(asset.name, data)
    this.set({ kind: 'ready', version, action: 'open' })
  }

  private fail(err: unknown): void {
    this.set({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }

  private set(state: UpdateState): void {
    this.state = state
    this.deps.onChange(state)
  }
}
