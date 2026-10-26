// The Secure Vault, through the account menu of the built app.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { start } from './app.mjs'

const MASTER = 'Zain Goraya master 2026'
const PASSWORD = 'Bank-pass-7731-Goraya'

describe('secure vault', () => {
  let app
  before(async () => {
    app = await start()
  })
  after(async () => {
    await app?.quit()
    app?.removeProfile()
  })

  async function fill(placeholder, text) {
    await app.click(`.vault-sheet input[placeholder=${JSON.stringify(placeholder)}]`)
    await app.typeKeys(text)
  }

  const vaultFiles = () => readdirSync(app.dataDir).filter((f) => /^vault-.*\.json$/.test(f))

  it('creates a vault only once the warning is confirmed', async () => {
    await app.click('[aria-label="Account"]')
    await app.click('.pop-action', 'Secure Vault')
    await fill('Master password (at least 12 characters)', MASTER)
    await fill('Type it again', MASTER)
    await app.click('.vault-primary', 'Create Vault')
    await app.waitFor(`$('.vault-error')?.textContent === 'Type “I understand” to confirm.'`)
    assert.deepEqual(vaultFiles(), [])
    await app.click('.vault-label input')
    await app.typeKeys('I understand')
    await app.click('.vault-primary', 'Create Vault')
    await app.waitFor(`byText('.sheet-head .pop-action', 'Add')`)
  })

  it('saves an entry encrypted on disk and shows its password on request', async () => {
    await app.click('.sheet-head .pop-action', 'Add')
    await fill('Title', 'Bank')
    await fill('Username or email', 'zain_goraya')
    await fill('Password', PASSWORD)
    await app.click('.vault-primary', 'Save')
    await app.waitFor(`byText('.vault-row-title', 'Bank')`)
    await app.click('[aria-label="Show password"]')
    await app.waitFor(`$('.vault-secret')?.textContent === ${JSON.stringify(PASSWORD)}`)
    const [file] = vaultFiles()
    const stored = readFileSync(join(app.dataDir, file), 'utf8')
    for (const secret of [PASSWORD, MASTER, 'zain_goraya', 'Bank']) assert.equal(stored.includes(secret), false, `${secret} is not stored in the clear`)
  })

  it('locks, refuses a wrong master password, and unlocks with the right one', async () => {
    await app.click('.sheet-head .pop-action', 'Lock')
    await app.waitFor(`byText('.vault-text', 'The vault is locked.')`)
    await fill('Master password', 'not the master password')
    await app.click('.vault-primary', 'Unlock')
    await app.waitFor(`$('.vault-error')`)
    assert.equal(await app.js(`return !!byText('.vault-text', 'The vault is locked.')`), true)
    await app.js(`$('.vault-sheet input[type="password"]').select()`)
    await app.typeKeys(MASTER)
    await app.click('.vault-primary', 'Unlock')
    await app.waitFor(`byText('.vault-row-title', 'Bank')`)
  })

  it('logs no errors', () => {
    assert.deepEqual(app.errors, [])
  })
})
