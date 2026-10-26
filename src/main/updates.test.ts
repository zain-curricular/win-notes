import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { Updates, type Installer, type Release, type UpdateDeps } from './updates'

const DMG = Buffer.from('new notes installer')
// sha256 of DMG
const DMG_SHA = '02d5b5d36c45b5a8387bd4ad73954fc9d1c49bf879d1abf634605bbdbf6ebfd8'

function release(version: string, { sums = true }: { sums?: boolean } = {}): Release {
  return {
    tag_name: `v${version}`,
    assets: [
      { name: `Notes-${version}-universal.dmg`, browser_download_url: 'https://example.test/notes.dmg' },
      { name: `Notes-${version}.apk`, browser_download_url: 'https://example.test/notes.apk' },
      ...(sums ? [{ name: 'SHA256SUMS', browser_download_url: 'https://example.test/SHA256SUMS' }] : [])
    ]
  }
}

function downloadPath(latest: Release, sha = DMG_SHA): { updates: Updates; deps: UpdateDeps } {
  const deps: UpdateDeps = {
    version: '0.3.2',
    assetExt: '.dmg',
    latestRelease: vi.fn(async () => latest),
    fetchText: vi.fn(async () => `${'0'.repeat(64)}  Notes-0.4.0.apk\n${sha}  Notes-0.4.0-universal.dmg\n`),
    download: vi.fn(async (_url: string, onProgress: (p: number) => void) => (onProgress(100), DMG)),
    save: vi.fn(async (name: string) => `/data/updates/${name}`),
    open: vi.fn(async () => {}),
    onChange: vi.fn()
  }
  return { updates: new Updates(deps), deps }
}

describe('downloading and opening the new installer (Mac, .deb)', () => {
  it('checks the download against the release checksum, then opens it when asked', async () => {
    const { updates, deps } = downloadPath(release('0.4.0'))
    await updates.check(true)
    expect(updates.state).toEqual({ kind: 'ready', version: '0.4.0', action: 'open' })
    expect(deps.save).toHaveBeenCalledWith('Notes-0.4.0-universal.dmg', DMG)
    expect(deps.open).not.toHaveBeenCalled()
    await updates.apply()
    expect(deps.open).toHaveBeenCalledWith('/data/updates/Notes-0.4.0-universal.dmg')
  })

  it('never saves or opens a download that does not match its checksum', async () => {
    const { updates, deps } = downloadPath(release('0.4.0'), 'f'.repeat(64))
    await updates.check(true)
    expect(updates.state).toEqual({ kind: 'error', message: 'The download of Notes 0.4.0 did not match its checksum' })
    await updates.apply()
    expect(deps.save).not.toHaveBeenCalled()
    expect(deps.open).not.toHaveBeenCalled()
  })

  it('refuses a release without checksums before downloading', async () => {
    const { updates, deps } = downloadPath(release('0.4.0', { sums: false }))
    await updates.check(true)
    expect(updates.state).toEqual({ kind: 'error', message: "Notes 0.4.0 has no checksums, so its download can't be verified" })
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('reports up to date without downloading when the release is not newer', async () => {
    const { updates, deps } = downloadPath(release('0.3.2'))
    await updates.check(true)
    expect(updates.state).toEqual({ kind: 'current', version: '0.3.2' })
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('keeps a failed quiet check quiet', async () => {
    const { updates, deps } = downloadPath(release('0.4.0'))
    deps.latestRelease = vi.fn(async () => Promise.reject(new Error('offline')))
    await updates.check(false)
    expect(updates.state).toEqual({ kind: 'error', message: 'offline' })
    expect(updates.manual).toBe(false)
  })
})

describe('installing in place (Windows, AppImage)', () => {
  function installPath(): { updates: Updates; installer: Installer & EventEmitter } {
    const installer = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(async () => {}), quitAndInstall: vi.fn() })
    const { deps } = downloadPath(release('0.4.0'))
    return { updates: new Updates({ ...deps, installer }), installer }
  }

  it('follows the download and restarts into the update only when asked', async () => {
    const { updates, installer } = installPath()
    await updates.check(false)
    installer.emit('update-available', { version: '0.4.0' })
    installer.emit('download-progress', { percent: 41.6 })
    expect(updates.state).toEqual({ kind: 'downloading', version: '0.4.0', percent: 42 })
    installer.emit('update-downloaded', { version: '0.4.0' })
    expect(updates.state).toEqual({ kind: 'ready', version: '0.4.0', action: 'restart' })
    expect(installer.quitAndInstall).not.toHaveBeenCalled()
    await updates.apply()
    expect(installer.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true)
  })

  it('answers a check made while an update waits with that update, not a new check', async () => {
    const { updates, installer } = installPath()
    await updates.check(false)
    installer.emit('update-downloaded', { version: '0.4.0' })
    await updates.check(true)
    expect(installer.checkForUpdates).toHaveBeenCalledOnce()
    expect(updates.manual).toBe(true)
    expect(updates.state).toEqual({ kind: 'ready', version: '0.4.0', action: 'restart' })
  })
})
