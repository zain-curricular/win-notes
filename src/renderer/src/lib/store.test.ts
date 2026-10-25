import { beforeEach, describe, expect, it, vi } from 'vitest'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k)
})
vi.stubGlobal('window', { addEventListener: () => {} })
const { useStore } = await import('./store')

const signedIn = async (userId: string, { unsynced }: { unsynced: boolean }): Promise<void> => {
  const store = useStore.getState()
  store.load(userId)
  const id = store.createNote()
  store.updateNote(id, { title: 'Shopping', body: 'Shopping' })
  if (!unsynced) useStore.setState({ dirtyNotes: {}, dirtyFolders: {}, pendingDeletes: [] })
  await vi.waitFor(() => expect(saved.has(`win-notes:${userId}`)).toBe(true))
}

describe('signing out', () => {
  beforeEach(() => {
    saved.clear()
    useStore.getState().reset()
  })

  it("removes the account's notes from this computer once everything is synced", async () => {
    await signedIn('user-1', { unsynced: false })
    useStore.getState().reset({ forget: true })
    expect(saved.has('win-notes:user-1')).toBe(false)
  })

  it('keeps them, change included, while a change has not reached the server', async () => {
    await signedIn('user-1', { unsynced: true })
    useStore.getState().reset({ forget: true })
    const cache = JSON.parse(saved.get('win-notes:user-1')!)
    expect(Object.keys(cache.dirtyNotes)).toHaveLength(1)
  })

  it('never removes notes kept without an account', async () => {
    await signedIn('local', { unsynced: false })
    useStore.getState().reset({ forget: true })
    expect(saved.has('win-notes:local')).toBe(true)
  })
})
