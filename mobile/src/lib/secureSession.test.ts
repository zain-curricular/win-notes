import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-secure-store', () => ({}))
const { secureSessionStorage } = await import('./secureSession')

function fakeSecureStore() {
  const items = new Map<string, string>()
  return {
    items,
    getItemAsync: async (k: string) => items.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`)
      if (new TextEncoder().encode(v).length > 2048) throw new Error('value over 2048 bytes')
      items.set(k, v)
    },
    deleteItemAsync: async (k: string) => void items.delete(k)
  }
}

const KEY = 'sb-abcdefghijklmnop-auth-token'

describe('the session on Android', () => {
  it('keeps a session larger than one SecureStore value, emoji included, and reads it back exactly', async () => {
    const secure = fakeSecureStore()
    const storage = secureSessionStorage(secure)
    const session = JSON.stringify({ access_token: 'a'.repeat(1500), user: { name: 'Zain 📝'.repeat(300) } })
    await storage.setItem(KEY, session)
    expect(await storage.getItem(KEY)).toBe(session)
    expect(secure.items.get(`${KEY}.count`)).toBe('7')
  })

  it('leaves no pieces of a longer session behind when a shorter one replaces it, or when it is removed', async () => {
    const secure = fakeSecureStore()
    const storage = secureSessionStorage(secure)
    await storage.setItem(KEY, 'x'.repeat(1200))
    await storage.setItem(KEY, 'short')
    expect([...secure.items.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.count`])
    expect(await storage.getItem(KEY)).toBe('short')
    await storage.removeItem(KEY)
    expect(secure.items.size).toBe(0)
  })

  it('reads a missing or undecryptable piece as signed out', async () => {
    const secure = fakeSecureStore()
    const storage = secureSessionStorage(secure)
    await storage.setItem(KEY, 'y'.repeat(1200))
    secure.items.delete(`${KEY}.1`)
    expect(await storage.getItem(KEY)).toBeNull()
    const broken = secureSessionStorage({ ...secure, getItemAsync: async () => Promise.reject(new Error('Could not decrypt')) })
    expect(await broken.getItem(KEY)).toBeNull()
  })
})
