// Runs Electron's own installer (it downloads the binary and writes node_modules/electron/path.txt), retrying when
// the download fails: the installer gives up on the first dropped connection, which fails the whole npm ci.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Calls attempt() until it returns true, up to delaysMs.length + 1 times, waiting delaysMs[i] before retry i + 1. */
export async function withRetries(attempt, delaysMs, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; ; i++) {
    if (await attempt()) return true
    if (i === delaysMs.length) return false
    console.error(`Electron download failed; retrying in ${delaysMs[i] / 1000} s.`)
    await wait(delaysMs[i])
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const installer = createRequire(import.meta.url).resolve('electron/install.js')
  const ok = await withRetries(() => spawnSync(process.execPath, [installer], { stdio: 'inherit' }).status === 0, [5000, 20000])
  if (!ok) process.exit(1)
}
