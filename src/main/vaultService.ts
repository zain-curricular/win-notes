import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  assertAccountId,
  changeMasterPassword,
  createVault,
  loadVaultFile,
  readEntries,
  saveVaultFile,
  unlockVault,
  VaultError,
  writeEntries,
  type VaultEntry,
  type VaultFile
} from './vault'

export const MIN_MASTER_PASSWORD = 12
export type EntrySummary = Pick<VaultEntry, 'id' | 'title' | 'username' | 'url' | 'updatedAt'>
export type EntryInput = Omit<VaultEntry, 'id' | 'updatedAt'> & { id?: string }
export type VaultStatus = 'none' | 'locked' | 'unlocked'
export type VaultResult<T> = { ok: true; value: T } | { ok: false; code: string }

type Clipboard = { readText: () => string | Promise<string>; writeText: (text: string) => void | Promise<void>; clear: () => void }
type Options = { dir: string; clipboard: Clipboard; autoLockMs?: number; clipboardClearMs?: number; onLock?: () => void }
type Session = { accountId: string; path: string; file: VaultFile; key: Buffer }

const LIMITS = { title: 200, username: 200, password: 1000, url: 2048, notes: 10000 } as const
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

function validEntry(input: EntryInput): boolean {
  if (typeof input !== 'object' || !input) return false
  if (input.id !== undefined && (typeof input.id !== 'string' || !input.id)) return false
  const fields = Object.keys(LIMITS) as (keyof typeof LIMITS)[]
  if (!fields.every((f) => typeof input[f] === 'string' && input[f].length <= LIMITS[f])) return false
  if (!input.title.trim()) return false
  if (!input.url) return true
  try {
    return ['http:', 'https:'].includes(new URL(input.url).protocol)
  } catch {
    return false
  }
}

export class VaultService {
  private session: Session | null = null
  private lockTimer: ReturnType<typeof setTimeout> | undefined
  private clipTimer: ReturnType<typeof setTimeout> | undefined
  private copiedHash: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private readonly autoLockMs: number
  private readonly clipboardClearMs: number

  constructor(private readonly options: Options) {
    this.autoLockMs = options.autoLockMs ?? 5 * 60_000
    this.clipboardClearMs = options.clipboardClearMs ?? 30_000
  }

  private pathFor(accountId: string): string {
    assertAccountId(accountId)
    return join(this.options.dir, `vault-${accountId}.json`)
  }

  /** Restarts the inactivity countdown; called on every vault action and on key presses in the window. */
  touch(): void {
    if (!this.session) return
    clearTimeout(this.lockTimer)
    this.lockTimer = setTimeout(() => this.lock(), this.autoLockMs)
  }

  lock(): void {
    clearTimeout(this.lockTimer)
    const wasOpen = !!this.session
    this.session?.key.fill(0)
    this.session = null
    void this.clearCopiedPassword()
    if (wasOpen) this.options.onLock?.()
  }

  private async clearCopiedPassword(): Promise<void> {
    clearTimeout(this.clipTimer)
    const hash = this.copiedHash
    this.copiedHash = null
    if (!hash) return
    try {
      if (sha256(await this.options.clipboard.readText()) === hash) this.options.clipboard.clear()
    } catch {
      this.options.clipboard.clear()
    }
  }

  private open(session: Session): void {
    this.lock()
    this.session = session
    this.touch()
  }

  private unlocked(): Session {
    if (!this.session) throw new VaultError('unlock-failed')
    this.touch()
    return this.session
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  async status(accountId: string): Promise<VaultStatus> {
    if (this.session && this.session.accountId !== accountId) this.lock()
    if (this.session) return 'unlocked'
    return (await loadVaultFile(this.pathFor(accountId))) ? 'locked' : 'none'
  }

  create(accountId: string, password: string): Promise<void> {
    return this.serial(async () => {
      if (typeof password !== 'string' || password.length < MIN_MASTER_PASSWORD) throw new VaultError('weak-password')
      const path = this.pathFor(accountId)
      if (await loadVaultFile(path)) throw new VaultError('exists')
      const { file, vaultKey } = await createVault(password, accountId)
      await saveVaultFile(path, file)
      this.open({ accountId, path, file, key: vaultKey })
    })
  }

  unlock(accountId: string, password: string): Promise<void> {
    return this.serial(async () => {
      const path = this.pathFor(accountId)
      const file = await loadVaultFile(path)
      if (!file || typeof password !== 'string') throw new VaultError('unlock-failed')
      const key = await unlockVault(file, password, accountId)
      readEntries(file, key, accountId)
      this.open({ accountId, path, file, key })
    })
  }

  list(): EntrySummary[] {
    const { file, key, accountId } = this.unlocked()
    return readEntries(file, key, accountId)
      .map(({ id, title, username, url, updatedAt }) => ({ id, title, username, url, updatedAt }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  reveal(id: string): VaultEntry {
    const { file, key, accountId } = this.unlocked()
    const entry = readEntries(file, key, accountId).find((e) => e.id === id)
    if (!entry) throw new VaultError('not-found')
    return entry
  }

  private write(change: (entries: VaultEntry[]) => VaultEntry[]): Promise<EntrySummary[]> {
    return this.serial(async () => {
      const session = this.unlocked()
      const file = writeEntries(session.file, session.key, session.accountId, change(readEntries(session.file, session.key, session.accountId)))
      await saveVaultFile(session.path, file)
      if (this.session === session) session.file = file
      return this.list()
    })
  }

  save(input: EntryInput): Promise<EntrySummary[]> {
    if (!validEntry(input)) return Promise.reject(new VaultError('invalid-entry'))
    return this.write((entries) => {
      const { title, username, password, url, notes } = input
      const entry = { id: input.id ?? randomUUID(), title: title.trim(), username, password, url, notes, updatedAt: new Date().toISOString() }
      if (input.id && !entries.some((e) => e.id === input.id)) throw new VaultError('not-found')
      return input.id ? entries.map((e) => (e.id === input.id ? entry : e)) : [...entries, entry]
    })
  }

  remove(id: string): Promise<EntrySummary[]> {
    return this.write((entries) => entries.filter((e) => e.id !== id))
  }

  /** Puts the password on the clipboard and takes it off again later, unless something else was copied since. */
  async copyPassword(id: string): Promise<void> {
    const { password } = this.reveal(id)
    await this.clearCopiedPassword()
    await this.options.clipboard.writeText(password)
    this.copiedHash = sha256(password)
    if (!this.session) return this.clearCopiedPassword()
    this.clipTimer = setTimeout(() => void this.clearCopiedPassword(), this.clipboardClearMs)
  }

  changePassword(current: string, next: string): Promise<void> {
    return this.serial(async () => {
      const session = this.unlocked()
      if (typeof next !== 'string' || next.length < MIN_MASTER_PASSWORD) throw new VaultError('weak-password')
      const check = await unlockVault(session.file, current, session.accountId)
      check.fill(0)
      const file = await changeMasterPassword(session.file, session.key, session.accountId, next)
      await saveVaultFile(session.path, file)
      if (this.session === session) session.file = file
    })
  }
}

/** Runs a vault call and turns its outcome into a plain result, so no stack or message crosses to the renderer. */
export async function result<T>(call: () => T | Promise<T>): Promise<VaultResult<T>> {
  try {
    return { ok: true, value: await call() }
  } catch (err) {
    return { ok: false, code: err instanceof VaultError ? err.code : 'failed' }
  }
}
