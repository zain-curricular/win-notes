import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  changeMasterPassword,
  createVault,
  loadVaultFile,
  parseVaultFile,
  readEntries,
  saveVaultFile,
  unlockVault,
  writeEntries,
  type VaultEntry,
  type VaultFile
} from './vault'

const ACCOUNT = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'
const PASSWORD = 'correct horse battery staple'
const ENTRY: VaultEntry = {
  id: 'e1',
  title: 'Bank',
  username: 'zain@example.com',
  password: 'Pw-7a8b9c-UNIQUE',
  url: 'https://bank.example',
  notes: 'pin hint: SECRET-NOTE',
  updatedAt: '2026-10-25T00:00:00.000Z'
}

let file: VaultFile
let vaultKey: Buffer

beforeAll(async () => {
  const created = await createVault(PASSWORD, ACCOUNT)
  file = writeEntries(created.file, created.vaultKey, ACCOUNT, [ENTRY])
  vaultKey = created.vaultKey
}, 30_000)

const flip = (b64: string, at = 0): string => {
  const bytes = Buffer.from(b64, 'base64')
  bytes[at] ^= 0x01
  return bytes.toString('base64')
}

describe('vault encryption', () => {
  it('opens with the master password and returns the entries', async () => {
    const key = await unlockVault(file, PASSWORD, ACCOUNT)
    expect(key.equals(vaultKey)).toBe(true)
    expect(readEntries(file, key, ACCOUNT)).toEqual([ENTRY])
  })

  it('refuses a wrong master password', async () => {
    await expect(unlockVault(file, 'correct horse battery stapler', ACCOUNT)).rejects.toMatchObject({ code: 'unlock-failed' })
  })

  it('stores no entry text, master password or key in the file', () => {
    const text = JSON.stringify(file)
    for (const secret of [PASSWORD, ENTRY.password, ENTRY.notes, ENTRY.username, ENTRY.title, vaultKey.toString('base64'), vaultKey.toString('hex')]) {
      expect(text).not.toContain(secret)
    }
  })

  it('uses a fresh nonce for every save', () => {
    const again = writeEntries(file, vaultKey, ACCOUNT, [ENTRY])
    expect(again.entries.nonce).not.toBe(file.entries.nonce)
    expect(again.entries.data).not.toBe(file.entries.data)
  })
})

describe('a changed vault file fails closed', () => {
  it.each<[string, (f: VaultFile) => VaultFile]>([
    ['wrapped key byte', (f) => ({ ...f, wrappedKey: { ...f.wrappedKey, data: flip(f.wrappedKey.data, 3) } })],
    ['wrapped key tag byte', (f) => ({ ...f, wrappedKey: { ...f.wrappedKey, data: flip(f.wrappedKey.data, 40) } })],
    ['wrapped key nonce', (f) => ({ ...f, wrappedKey: { ...f.wrappedKey, nonce: flip(f.wrappedKey.nonce) } })],
    ['salt', (f) => ({ ...f, kdf: { ...f.kdf, salt: flip(f.kdf.salt) } })],
    ['scrypt N raised', (f) => ({ ...f, kdf: { ...f.kdf, N: 2 ** 18 } })]
  ])('%s: unlock refused', async (_name, edit) => {
    await expect(unlockVault(edit(file), PASSWORD, ACCOUNT)).rejects.toMatchObject({ code: 'unlock-failed' })
  })

  it('scrypt N lowered: refused before any key is derived', async () => {
    await expect(unlockVault({ ...file, kdf: { ...file.kdf, N: 2 ** 14 } }, PASSWORD, ACCOUNT)).rejects.toMatchObject({ code: 'weak-kdf' })
  })

  it('another account id: unlock refused', async () => {
    await expect(unlockVault(file, PASSWORD, 'local')).rejects.toMatchObject({ code: 'unlock-failed' })
  })

  it.each<[string, (f: VaultFile) => VaultFile]>([
    ['entries byte', (f) => ({ ...f, entries: { ...f.entries, data: flip(f.entries.data, 5) } })],
    ['entries nonce', (f) => ({ ...f, entries: { ...f.entries, nonce: flip(f.entries.nonce) } })],
    ['entries cut short', (f) => ({ ...f, entries: { ...f.entries, data: Buffer.from(f.entries.data, 'base64').subarray(0, 10).toString('base64') } })]
  ])('%s: entries refused', (_name, edit) => {
    expect(() => readEntries(edit(file), vaultKey, ACCOUNT)).toThrow(expect.objectContaining({ code: 'unlock-failed' }))
  })

  it('entries copied in from another vault: refused', async () => {
    const other = await createVault(PASSWORD, ACCOUNT)
    const foreign = writeEntries(other.file, other.vaultKey, ACCOUNT, [ENTRY])
    expect(() => readEntries({ ...file, entries: foreign.entries }, vaultKey, ACCOUNT)).toThrow(expect.objectContaining({ code: 'unlock-failed' }))
  }, 15_000)
})

describe('changing the master password', () => {
  it('keeps the entries, opens with the new password only', async () => {
    const changed = await changeMasterPassword(file, vaultKey, ACCOUNT, 'a brand new passphrase')
    expect(changed.kdf.salt).not.toBe(file.kdf.salt)
    await expect(unlockVault(changed, PASSWORD, ACCOUNT)).rejects.toMatchObject({ code: 'unlock-failed' })
    expect(readEntries(changed, await unlockVault(changed, 'a brand new passphrase', ACCOUNT), ACCOUNT)).toEqual([ENTRY])
  }, 15_000)
})

describe('vault file on disk', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'notes-vault-'))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('saves owner-only, leaves no temp file, and loads back the same', async () => {
    const path = join(dir, `vault-${ACCOUNT}.json`)
    await saveVaultFile(path, file)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readdir(dir)).toEqual([`vault-${ACCOUNT}.json`])
    expect(await loadVaultFile(path)).toEqual(file)
    expect(await readFile(path, 'utf8')).not.toContain(ENTRY.password)
  })

  it('reports a missing vault as none', async () => {
    expect(await loadVaultFile(join(dir, 'vault-local.json'))).toBeNull()
  })

  it.each(['not json', '{}', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, kdf: { name: 'pbkdf2' } })])('rejects %s', (text) => {
    expect(() => parseVaultFile(text)).toThrow(expect.objectContaining({ code: 'invalid-file' }))
  })
})
