import { beforeEach, describe, expect, it, vi } from 'vitest'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k)
})
vi.stubGlobal('window', { addEventListener: () => {} })
const { useStore, sidebarVisible, setEditorFlush } = await import('./store')

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

describe('deleting a folder', () => {
  beforeEach(() => {
    saved.clear()
    useStore.getState().reset()
    useStore.getState().load('local')
  })

  it('sends its notes to Recently Deleted but drops empty ones, as deleting an empty note does', () => {
    const store = useStore.getState()
    const folderId = store.createFolder('Trip')
    const kept = store.createNote()
    store.updateNote(kept, { title: 'Packing', body: 'Packing' })
    store.selectNote(null)
    const empty = useStore.getState().createNote()
    useStore.getState().deleteFolder(folderId)
    const { notes, pendingDeletes } = useStore.getState()
    expect(notes[kept].deleted_at).not.toBeNull()
    expect(notes[empty]).toBeUndefined()
    expect(pendingDeletes).toContainEqual({ table: 'notes', id: empty })
  })
})

describe('the sidebar in a narrow window', () => {
  beforeEach(() => {
    saved.clear()
    useStore.getState().reset()
    useStore.getState().load('local')
    useStore.getState().setNarrow(false)
  })

  it('opens as an overlay without changing the saved preference, and closes when a folder is chosen', () => {
    const store = useStore.getState()
    store.setNarrow(true)
    expect(sidebarVisible(useStore.getState())).toBe(false)
    store.toggleSidebar()
    expect(sidebarVisible(useStore.getState())).toBe(true)
    expect(useStore.getState().sidebarOpen).toBe(true)
    store.setView('all')
    expect(sidebarVisible(useStore.getState())).toBe(false)
    store.setNarrow(false)
    expect(sidebarVisible(useStore.getState())).toBe(true)
  })
})

describe('text the open editor has not saved yet', () => {
  beforeEach(() => {
    saved.clear()
    useStore.getState().reset()
    useStore.getState().load('local')
  })

  it('counts before New Note decides whether the current note is empty', () => {
    const typed = useStore.getState().createNote()
    let pending: string | null = 'Alpha'
    const unregister = setEditorFlush(() => {
      if (pending) useStore.getState().updateNote(typed, { title: pending, body: pending })
      pending = null
    })
    const next = useStore.getState().createNote()
    unregister()
    expect(next).not.toBe(typed)
    expect(useStore.getState().notes[typed].title).toBe('Alpha')
  })
})
