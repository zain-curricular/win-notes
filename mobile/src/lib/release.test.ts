import { describe, expect, it } from 'vitest'
import { isNewer as desktopIsNewer } from '../../../src/main/version'
import { findApkUpdate, isNewer, RELEASES_API } from './release'

const release = (tag: string, assets = [{ name: `Notes-${tag.slice(1)}.apk`, browser_download_url: 'https://example.test/notes.apk' }]) => async (url: string) => {
  expect(url).toBe(RELEASES_API)
  return { tag_name: tag, assets }
}

describe('the Android update check', () => {
  it('offers the APK of a newer release', async () => {
    expect(await findApkUpdate('0.3.2', release('v0.4.0'))).toEqual({ version: '0.4.0', url: 'https://example.test/notes.apk' })
  })

  it('offers nothing when the release is this version or older', async () => {
    expect(await findApkUpdate('0.3.2', release('v0.3.2'))).toBeNull()
    expect(await findApkUpdate('0.3.2', release('v0.1.0'))).toBeNull()
  })

  it('says so when a newer release has no APK', async () => {
    await expect(findApkUpdate('0.3.2', release('v0.4.0', []))).rejects.toThrow('Notes 0.4.0 has no Android download')
  })

  it.each([
    ['0.4.0', '0.3.2'],
    ['0.3.10', '0.3.9'],
    ['0.3.2', '0.3.2'],
    ['0.3.1', '0.3.2'],
    ['0.4.0-beta', '0.3.2'],
    ['1.0.0', '0.9.9-rc.1']
  ])('agrees with the desktop app on whether %s is newer than %s', (latest, current) => {
    expect(isNewer(latest, current)).toBe(desktopIsNewer(latest, current))
  })
})
