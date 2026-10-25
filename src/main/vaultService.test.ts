import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { result, VaultService, type EntryInput } from './vaultService'

const ACCOUNT = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'
const MASTER = 'a long master passphrase'
const BANK: EntryInput = { title: 'Bank', username: 'zain', password: 'Pw-7a8b9c-UNIQUE', url: 'https://bank.example', notes: 'SECRET-NOTE' }

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notes-vault-service-'))
})
afterAll(() => rm(dir, { recursive: true, force: true }))
afterEach(() => vi.useRealTimers())

function clipboard() {
  let text = ''
  return { readText: () => text, writeText: (t: string) => void (text = t), clear: () => void (text = '') }
}

async function freshVault(accountId = ACCOUNT) {
  const clip = clipboard()
  const vault = new VaultService({ dir: await mkdtemp(join(dir, 'v-')), clipboard: clip, autoLockMs: 1000, clipboardClearMs: 500 })
  await vault.create(accountId, MASTER)
  return { vault, clip }
}

describe('vault service', () => {
  it('stores an entry, lists it without the password, and reveals it on request', async () => {
    const { vault } = await freshVault()
    const [summary] = await vault.save(BANK)
    expect(summary).toEqual({ id: summary.id, title: 'Bank', username: 'zain', url: 'https://bank.example', updatedAt: summary.updatedAt })
    expect(vault.reveal(summary.id)).toMatchObject({ password: BANK.password, notes: BANK.notes })
  }, 15_000)

  it('edits and deletes entries', async () => {
    const { vault } = await freshVault()
    const [{ id }] = await vault.save(BANK)
    await vault.save({ ...BANK, id, password: 'changed' })
    expect(vault.reveal(id).password).toBe('changed')
    expect(await vault.remove(id)).toEqual([])
  }, 15_000)

  it('refuses entries with unsafe or oversized fields', async () => {
    const { vault } = await freshVault()
    for (const bad of [{ ...BANK, url: 'javascript:alert(1)' }, { ...BANK, title: ' ' }, { ...BANK, notes: 'x'.repeat(10001) }, { ...BANK, id: '' }]) {
      expect(await result(() => vault.save(bad))).toEqual({ ok: false, code: 'invalid-entry' })
    }
  }, 15_000)

  it('writes no entry text or master password to disk', async () => {
    const { vault } = await freshVault()
    await vault.save(BANK)
    const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const content = await readFile(join(dir, f), 'utf8')
      for (const secret of [BANK.password, BANK.notes, BANK.username, MASTER]) expect(content).not.toContain(secret)
    }
  }, 15_000)

  it('locks after inactivity and then refuses every call that needs the key', async () => {
    const { vault } = await freshVault()
    const [{ id }] = await vault.save(BANK)
    vi.useFakeTimers()
    vault.touch()
    vi.advanceTimersByTime(999)
    expect(vault.list()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(await vault.status(ACCOUNT)).toBe('locked')
    const calls: (() => unknown)[] = [() => vault.list(), () => vault.reveal(id), () => vault.copyPassword(id), () => vault.save(BANK)]
    for (const call of calls) {
      expect(await result(call)).toEqual({ ok: false, code: 'unlock-failed' })
    }
  }, 15_000)

  it('locks when another account asks, and opens again only with the master password', async () => {
    const { vault } = await freshVault()
    await vault.save(BANK)
    expect(await vault.status('local')).toBe('none')
    expect(await result(() => vault.list())).toEqual({ ok: false, code: 'unlock-failed' })
    expect(await result(() => vault.unlock(ACCOUNT, 'wrong passphrase!'))).toEqual({ ok: false, code: 'unlock-failed' })
    await vault.unlock(ACCOUNT, MASTER)
    expect(vault.list()).toHaveLength(1)
  }, 15_000)

  it('zeroes the key when it locks', async () => {
    const { vault } = await freshVault()
    const key = (vault as unknown as { session: { key: Buffer } }).session.key
    vault.lock()
    expect(key.every((b) => b === 0)).toBe(true)
  }, 15_000)

  it('clears a copied password after the delay, but not something copied since', async () => {
    const { vault, clip } = await freshVault()
    const [{ id }] = await vault.save(BANK)
    vi.useFakeTimers()
    await vault.copyPassword(id)
    expect(clip.readText()).toBe(BANK.password)
    await vi.advanceTimersByTimeAsync(500)
    expect(clip.readText()).toBe('')

    await vault.copyPassword(id)
    clip.writeText('something else')
    await vi.advanceTimersByTimeAsync(500)
    expect(clip.readText()).toBe('something else')
  }, 15_000)

  it('takes a copied password off the clipboard when it locks', async () => {
    const { vault, clip } = await freshVault()
    const [{ id }] = await vault.save(BANK)
    await vault.copyPassword(id)
    vault.lock()
    await vi.waitFor(() => expect(clip.readText()).toBe(''))
  }, 15_000)

  it('refuses a short master password and a second vault for the same account', async () => {
    const vault = new VaultService({ dir: await mkdtemp(join(dir, 'v-')), clipboard: clipboard() })
    expect(await result(() => vault.create(ACCOUNT, 'short'))).toEqual({ ok: false, code: 'weak-password' })
    await vault.create(ACCOUNT, MASTER)
    expect(await result(() => vault.create(ACCOUNT, MASTER))).toEqual({ ok: false, code: 'exists' })
  }, 15_000)

  it('changes the master password only when the current one is right', async () => {
    const { vault } = await freshVault()
    await vault.save(BANK)
    expect(await result(() => vault.changePassword('not the password', 'another long passphrase'))).toEqual({ ok: false, code: 'unlock-failed' })
    await vault.changePassword(MASTER, 'another long passphrase')
    vault.lock()
    expect(await result(() => vault.unlock(ACCOUNT, MASTER))).toEqual({ ok: false, code: 'unlock-failed' })
    await vault.unlock(ACCOUNT, 'another long passphrase')
    expect(vault.list()).toHaveLength(1)
  }, 30_000)

  it('refuses an account id that could point outside the vault folder', async () => {
    const vault = new VaultService({ dir, clipboard: clipboard() })
    expect(await result(() => vault.status('../../etc/passwd'))).toEqual({ ok: false, code: 'invalid-file' })
    expect(await result(() => vault.status(['local'] as unknown as string))).toEqual({ ok: false, code: 'invalid-file' })
  })
})
