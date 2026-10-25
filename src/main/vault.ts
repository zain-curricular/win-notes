import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { open, readFile, rename, rm } from 'node:fs/promises'

// OWASP's scrypt setting. Electron's BoringSSL has no Argon2id, so scrypt is the strongest KDF available without a
// native dependency. Weaker settings in a file are refused rather than used.
export const KDF = { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 } as const
const MIN_N = 2 ** 17
const MAX_N = 2 ** 20
const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export type Sealed = { nonce: string; data: string }
export type VaultFile = {
  version: 1
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string }
  wrappedKey: Sealed
  entries: Sealed
}
export type VaultEntry = {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  updatedAt: string
}

export class VaultError extends Error {
  constructor(readonly code: 'unlock-failed' | 'invalid-file' | 'weak-kdf' | 'weak-password' | 'exists' | 'not-found' | 'invalid-entry') {
    super(code)
  }
}

const ACCOUNT_ID = /^(local|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

export function assertAccountId(accountId: string): void {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) throw new VaultError('invalid-file')
}

// Binds each ciphertext to its vault, account, KDF settings and purpose, so a swapped or edited field fails to open.
function additionalData(file: Pick<VaultFile, 'version' | 'kdf'>, accountId: string, purpose: 'key' | 'entries'): Buffer {
  const { N, r, p, salt } = file.kdf
  return Buffer.from(`win-notes-vault:v${file.version}:${accountId}:scrypt:${N}:${r}:${p}:${salt}:${purpose}`)
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Sealed {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES }).setAAD(aad)
  const data = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { nonce: nonce.toString('base64'), data: data.toString('base64') }
}

function unseal(key: Buffer, sealed: Sealed, aad: Buffer): Buffer {
  const nonce = Buffer.from(sealed.nonce, 'base64')
  const data = Buffer.from(sealed.data, 'base64')
  if (nonce.length !== NONCE_BYTES || data.length < TAG_BYTES) throw new VaultError('unlock-failed')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES }).setAAD(aad)
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES))
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()])
  } catch {
    throw new VaultError('unlock-failed')
  }
}

function deriveKey(password: string, kdf: VaultFile['kdf']): Promise<Buffer> {
  const { N, r, p } = kdf
  if (N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0 || r !== KDF.r || p !== KDF.p) return Promise.reject(new VaultError('weak-kdf'))
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFC'), Buffer.from(kdf.salt, 'base64'), KEY_BYTES, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  )
}

function sealEntries(file: Omit<VaultFile, 'entries'>, vaultKey: Buffer, accountId: string, entries: VaultEntry[]): VaultFile {
  return { ...file, entries: seal(vaultKey, Buffer.from(JSON.stringify(entries)), additionalData(file, accountId, 'entries')) }
}

/** A new, empty vault and its key. The master password is used once and never kept. */
export async function createVault(password: string, accountId: string): Promise<{ file: VaultFile; vaultKey: Buffer }> {
  assertAccountId(accountId)
  const head = { version: 1 as const, kdf: { ...KDF, salt: randomBytes(16).toString('base64') } }
  const vaultKey = randomBytes(KEY_BYTES)
  const kek = await deriveKey(password, head.kdf)
  try {
    const wrappedKey = seal(kek, vaultKey, additionalData(head, accountId, 'key'))
    return { file: sealEntries({ ...head, wrappedKey }, vaultKey, accountId, []), vaultKey }
  } finally {
    kek.fill(0)
  }
}

/** The vault key, or VaultError('unlock-failed') for a wrong password and for a damaged or edited file alike. */
export async function unlockVault(file: VaultFile, password: string, accountId: string): Promise<Buffer> {
  assertAccountId(accountId)
  const kek = await deriveKey(password, file.kdf)
  try {
    const vaultKey = unseal(kek, file.wrappedKey, additionalData(file, accountId, 'key'))
    if (vaultKey.length !== KEY_BYTES) throw new VaultError('unlock-failed')
    return vaultKey
  } finally {
    kek.fill(0)
  }
}

export function readEntries(file: VaultFile, vaultKey: Buffer, accountId: string): VaultEntry[] {
  const plaintext = unseal(vaultKey, file.entries, additionalData(file, accountId, 'entries'))
  try {
    const entries: unknown = JSON.parse(plaintext.toString('utf8'))
    if (!Array.isArray(entries)) throw new VaultError('invalid-file')
    return entries as VaultEntry[]
  } finally {
    plaintext.fill(0)
  }
}

/** The same vault with new entries, sealed under a fresh nonce. */
export function writeEntries(file: VaultFile, vaultKey: Buffer, accountId: string, entries: VaultEntry[]): VaultFile {
  return sealEntries(file, vaultKey, accountId, entries)
}

/** Re-wraps the vault key under a new master password and salt; the entries are re-sealed to match the new settings. */
export async function changeMasterPassword(file: VaultFile, vaultKey: Buffer, accountId: string, newPassword: string): Promise<VaultFile> {
  const entries = readEntries(file, vaultKey, accountId)
  const head = { version: 1 as const, kdf: { ...KDF, salt: randomBytes(16).toString('base64') } }
  const kek = await deriveKey(newPassword, head.kdf)
  try {
    const wrappedKey = seal(kek, vaultKey, additionalData(head, accountId, 'key'))
    return sealEntries({ ...head, wrappedKey }, vaultKey, accountId, entries)
  } finally {
    kek.fill(0)
  }
}

const isSealed = (v: unknown): v is Sealed =>
  !!v && typeof (v as Sealed).nonce === 'string' && typeof (v as Sealed).data === 'string'

export function parseVaultFile(text: string): VaultFile {
  let v: VaultFile
  try {
    v = JSON.parse(text)
  } catch {
    throw new VaultError('invalid-file')
  }
  const k = v?.kdf
  if (
    v?.version !== 1 ||
    k?.name !== 'scrypt' ||
    ![k.N, k.r, k.p].every(Number.isInteger) ||
    typeof k.salt !== 'string' ||
    !isSealed(v.wrappedKey) ||
    !isSealed(v.entries)
  ) {
    throw new VaultError('invalid-file')
  }
  return { version: 1, kdf: { name: 'scrypt', N: k.N, r: k.r, p: k.p, salt: k.salt }, wrappedKey: v.wrappedKey, entries: v.entries }
}

export async function loadVaultFile(path: string): Promise<VaultFile | null> {
  try {
    return parseVaultFile(await readFile(path, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Writes beside the target and renames over it, so a crash or full disk never leaves half a vault. */
export async function saveVaultFile(path: string, file: VaultFile): Promise<void> {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  const handle = await open(tmp, 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify(file))
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}
