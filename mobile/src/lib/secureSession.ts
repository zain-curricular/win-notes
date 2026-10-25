import * as SecureStore from 'expo-secure-store'

// Supabase keeps the session (and the PKCE code verifier) here instead of AsyncStorage. SecureStore encrypts with a
// key in the Android Keystore, which never leaves the phone, and its values are excluded from backups.
// It holds about 2 KB per value, so a session is split into pieces of whole characters (4 UTF-8 bytes at most each).
const PIECE = 500

type Secure = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>

export function secureSessionStorage(secure: Secure = SecureStore) {
  const name = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_')
  const countOf = async (key: string): Promise<number> => {
    const n = Number(await secure.getItemAsync(`${name(key)}.count`))
    return Number.isInteger(n) && n > 0 ? n : 0
  }

  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const count = await countOf(key)
        if (!count) return null
        const pieces = await Promise.all(Array.from({ length: count }, (_, i) => secure.getItemAsync(`${name(key)}.${i}`)))
        return pieces.every((p) => p !== null) ? pieces.join('') : null
      } catch {
        // A Keystore key that is gone (a restored or reset phone) cannot decrypt; that just means signing in again.
        return null
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      const before = await countOf(key)
      const chars = Array.from(value)
      const pieces: string[] = []
      for (let i = 0; i < chars.length; i += PIECE) pieces.push(chars.slice(i, i + PIECE).join(''))
      if (!pieces.length) pieces.push('')
      for (const [i, piece] of pieces.entries()) await secure.setItemAsync(`${name(key)}.${i}`, piece)
      await secure.setItemAsync(`${name(key)}.count`, String(pieces.length))
      for (let i = pieces.length; i < before; i++) await secure.deleteItemAsync(`${name(key)}.${i}`)
    },

    async removeItem(key: string): Promise<void> {
      const count = await countOf(key)
      await secure.deleteItemAsync(`${name(key)}.count`)
      for (let i = 0; i < count; i++) await secure.deleteItemAsync(`${name(key)}.${i}`)
    }
  }
}
