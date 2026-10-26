export const RELEASES_API = 'https://api.github.com/repos/zain-curricular/win-notes/releases/latest'

// Mirrors isNewer in src/main/version.ts: a pre-release tag such as 0.3.0-beta never counts as later.
export function isNewer(latest: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(latest)) return false
  const a = latest.split('.').map(Number)
  const b = current.split(/[.-]/).slice(0, 3).map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > (b[i] || 0)
  return false
}

export type ApkUpdate = { version: string; url: string }

/** The APK of a newer published release, or null when this one is current. Network and GitHub errors throw. */
export async function findApkUpdate(current: string, fetchJson: (url: string) => Promise<unknown>): Promise<ApkUpdate | null> {
  const release = (await fetchJson(RELEASES_API)) as { tag_name?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] }
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : ''
  if (!isNewer(version, current)) return null
  const apk = (release.assets ?? []).find((a) => typeof a.name === 'string' && a.name.endsWith('.apk'))
  if (typeof apk?.browser_download_url !== 'string') throw new Error(`Notes ${version} has no Android download`)
  return { version, url: apk.browser_download_url }
}
