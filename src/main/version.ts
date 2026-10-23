/** True when `latest` is a later release than `current`. A pre-release tag such as 0.3.0-beta never counts as later. */
export function isNewer(latest: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(latest)) return false
  const a = latest.split('.').map(Number)
  const b = current.split(/[.-]/).slice(0, 3).map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > (b[i] || 0)
  return false
}
