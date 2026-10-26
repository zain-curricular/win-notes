// The update check against a local release feed, so it runs without a published release.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { start } from './app.mjs'

const INSTALLER = Buffer.from('Notes 0.4.0 installer')
const NAME = `Notes-0.4.0${{ darwin: '-universal.dmg', win32: '-Setup.exe' }[process.platform] ?? '_amd64.deb'}`

describe('updates', () => {
  let app, server, base
  let release = { version: '0.3.2', sha: '' }
  const saved = () => join(app.dataDir, 'updates', NAME)

  before(async () => {
    server = createServer((req, res) => {
      const files = {
        '/release.json': JSON.stringify({
          tag_name: `v${release.version}`,
          assets: [
            { name: NAME, browser_download_url: `${base}/${NAME}` },
            { name: 'SHA256SUMS', browser_download_url: `${base}/SHA256SUMS` }
          ]
        }),
        [`/${NAME}`]: INSTALLER,
        '/SHA256SUMS': `${release.sha}  ${NAME}\n`
      }
      const body = files[req.url]
      res.writeHead(body ? 200 : 404, body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      res.end(body)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}`
    app = await start({ env: { NOTES_UPDATE_FEED: base } })
    // The quiet check five seconds after launch, so it can't land in the middle of a test.
    await app.waitFor(`(await window.updates.state()).kind === 'current'`, 20000)
    assert.equal(await app.js(`return $('.update-notice')`), null, 'a quiet check that finds nothing says nothing')
  })
  after(async () => {
    await app?.quit()
    app?.removeProfile()
    server?.close()
  })

  async function checkForUpdates() {
    await app.click('[aria-label="Account"]')
    await app.click('.pop-action', 'Check for Updates')
  }

  it('says the app is up to date when the release is this version', async () => {
    await checkForUpdates()
    await app.waitFor(`$('.update-notice')?.textContent === 'Notes is up to date (0.3.2)'`)
    await app.click('.update-dismiss')
    await app.waitFor(`!$('.update-notice')`)
  })

  it('refuses a download that does not match the release checksum, and keeps nothing', async () => {
    release = { version: '0.4.0', sha: 'f'.repeat(64) }
    await checkForUpdates()
    await app.waitFor(`$('.update-notice')?.textContent === "Couldn't update: The download of Notes 0.4.0 did not match its checksum"`)
    assert.equal(await app.js(`return byText('.update-action', 'Open Installer') ?? null`), null)
    assert.equal(existsSync(saved()), false)
  })

  it('downloads a newer installer that matches its checksum and waits to open it', async () => {
    release = { version: '0.4.0', sha: createHash('sha256').update(INSTALLER).digest('hex') }
    await checkForUpdates()
    await app.waitFor(`$('.update-text')?.textContent === 'Notes 0.4.0 is downloaded' && byText('.update-action', 'Open Installer')`)
    assert.deepEqual(readFileSync(saved()), INSTALLER)
  })

  it('logs no errors', () => {
    assert.deepEqual(app.errors, [])
  })
})
