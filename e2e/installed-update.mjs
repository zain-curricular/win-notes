// An installed copy (NOTES_EXE) updates itself in place from a local feed of the next version's release files
// (NOTES_FEED_DIR), reopens as that version and keeps its notes. The Checks workflow builds both versions first.
import assert from 'node:assert/strict'
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, join } from 'node:path'
import { after, before, it } from 'node:test'
import { connect, MOD, start } from './app.mjs'

const { NOTES_EXE: executable, NOTES_FEED_DIR: dir, NOTES_NEXT_VERSION: next } = process.env
const NOTE = 'Kept through the update'

let server, feed
before(async () => {
  assert.ok(executable && dir && next, 'NOTES_EXE, NOTES_FEED_DIR and NOTES_NEXT_VERSION are set')
  server = createServer((req, res) => {
    const file = join(dir, basename(decodeURIComponent(new URL(req.url, 'http://feed').pathname)))
    try {
      res.writeHead(200, { 'Content-Length': statSync(file).size })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  feed = `http://127.0.0.1:${server.address().port}`
})
after(() => server?.close())

it('installs the next version over this one, reopens as it and keeps the notes', async () => {
  const app = await start({ executable, env: { NOTES_UPDATE_FEED: feed } })
  await app.key('n', [MOD])
  await app.waitFor(`document.activeElement?.closest('.ProseMirror')`)
  await app.typeKeys(NOTE)
  await app.waitFor(`localStorage.getItem('win-notes:local')?.includes(${JSON.stringify(NOTE)})`)
  await app.click('[aria-label="Account"]')
  await app.click('.pop-action', 'Check for Updates')
  await app.waitFor(`$('.update-text')?.textContent === 'Notes ${next} is ready'`, 180000)
  await app.click('.update-action', 'Restart to Update')
  await app.exited
  app.close()

  // The installer reopens Notes with the environment it was started from, so it comes back on the same port and profile.
  const updated = await connect(app.port, { tries: 900 })
  try {
    await updated.waitFor(`window.appInfo.version === ${JSON.stringify(next)}`)
    await updated.waitFor(`localStorage.getItem('win-notes:local')?.includes(${JSON.stringify(NOTE)})`, 20000)
  } finally {
    updated.send('Runtime.evaluate', { expression: 'window.close()' })
    updated.close()
  }
})
