import { app, ipcMain, net, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { autoUpdater } from 'electron-updater'
import { mkdir, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { Updates, type Release, type UpdateState } from './updates'

const RELEASES_API = 'https://api.github.com/repos/zain-curricular/win-notes/releases/latest'
const SIX_HOURS = 6 * 60 * 60 * 1000

// Testing aid: NOTES_UPDATE_FEED points at a local feed (release.json, the files, latest.yml) so updates can be tested
// without a published release.
const feed = process.env.NOTES_UPDATE_FEED

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await net.fetch(url, init)
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  return res
}

async function download(url: string, onProgress: (percent: number) => void): Promise<Buffer> {
  const res = await fetchOk(url)
  const total = Number(res.headers.get('content-length')) || 0
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
    received += chunk.length
    if (total) onProgress((received / total) * 100)
  }
  return Buffer.concat(chunks)
}

export function setupUpdates({ contents, isApp }: { contents: () => WebContents | null; isApp: (e: IpcMainInvokeEvent) => boolean }): {
  check: (manual: boolean) => Promise<void>
} {
  // Dev runs never look for updates unless a test feed is set.
  const enabled = app.isPackaged || !!feed
  // Windows installs and AppImages replace themselves; a Mac app without a Developer ID signature and a .deb can't,
  // so their new installer is downloaded, checked against the release's SHA256SUMS and opened. electron-updater needs
  // the app-update.yml that only a packaged build carries.
  const inPlace = app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE))
  if (inPlace) {
    if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    autoUpdater.autoDownload = true
    // Installing waits for "Restart to Update"; quitting never installs on its own.
    autoUpdater.autoInstallOnAppQuit = false
  }

  const send = (state: UpdateState): void => contents()?.send('updates-changed', { ...state, manual: updates.manual })
  const updates = new Updates({
    version: app.getVersion(),
    installer: inPlace ? autoUpdater : undefined,
    assetExt: { darwin: '.dmg', win32: '.exe' }[process.platform as string] ?? '.deb',
    latestRelease: async () =>
      (await (
        await fetchOk(feed ? `${feed}/release.json` : RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(15000)
        })
      ).json()) as Release,
    fetchText: async (url) => (await fetchOk(url, { signal: AbortSignal.timeout(15000) })).text(),
    download,
    save: async (name, data) => {
      const dir = join(app.getPath('userData'), 'updates')
      await mkdir(dir, { recursive: true })
      const path = join(dir, basename(name))
      await writeFile(path, data)
      return path
    },
    open: async (path) => {
      const failure = await shell.openPath(path)
      if (failure) throw new Error(failure)
    },
    onChange: send
  })

  const check = async (manual: boolean): Promise<void> => {
    if (enabled) return updates.check(manual)
    updates.manual = manual
    send({ kind: 'error', message: 'Updates are checked in the installed app.' })
  }

  ipcMain.handle('updates-state', (e) => (isApp(e) ? { ...updates.state, manual: updates.manual } : null))
  ipcMain.handle('updates-check', (e) => (isApp(e) ? check(true) : undefined))
  ipcMain.handle('updates-apply', async (e) => {
    if (!isApp(e)) return
    try {
      await updates.apply()
    } catch (err) {
      updates.manual = true
      send({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })

  if (enabled) {
    setTimeout(() => void check(false), 5000)
    setInterval(() => void check(false), SIX_HOURS)
  }
  return { check }
}
