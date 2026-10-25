import { beforeEach, describe, expect, it, vi } from 'vitest'

const saved = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => saved.get(k) ?? null,
    setItem: async (k: string, v: string) => void saved.set(k, v),
    removeItem: async (k: string) => void saved.delete(k)
  }
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }))
const { useStore } = await import('./store')

async function signedIn(userId: string, { unsynced }: { unsynced: boolean }): Promise<void> {
  await useStore.getState().load(userId)
  const id = useStore.getState().createNote()
  useStore.getState().updateNote(id, { title: 'Shopping', body: 'Shopping' })
  if (!unsynced) useStore.setState({ dirtyNotes: {}, dirtyFolders: {}, pendingDeletes: [] })
  await vi.waitFor(() => expect(saved.has(`win-notes:${userId}`)).toBe(true))
}

describe('signing out on Android', () => {
  beforeEach(() => {
    saved.clear()
    useStore.getState().reset()
  })

  it("removes the account's notes from this phone once everything is synced", async () => {
    await signedIn('user-1', { unsynced: false })
    useStore.getState().reset({ forget: true })
    await vi.waitFor(() => expect(saved.has('win-notes:user-1')).toBe(false))
  })

  it('keeps them, change included, while a change has not reached the server', async () => {
    await signedIn('user-1', { unsynced: true })
    useStore.getState().reset({ forget: true })
    await vi.waitFor(() => expect(Object.keys(JSON.parse(saved.get('win-notes:user-1') ?? '{}').dirtyNotes ?? {})).toHaveLength(1))
  })

  it('never removes notes kept without an account', async () => {
    await signedIn('local', { unsynced: false })
    useStore.getState().reset({ forget: true })
    await vi.waitFor(() => expect(saved.has('win-notes:local')).toBe(true))
  })
})
