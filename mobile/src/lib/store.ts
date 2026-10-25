// Port of src/renderer/src/lib/store.ts for React Native: same data model and conflict rules,
// with AsyncStorage instead of localStorage and no desktop-only layout state.
import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { time } from './dates'

export type JSONContent = {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONContent[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export type Folder = {
  id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export type Note = {
  id: string
  folder_id: string | null
  title: string
  snippet: string
  body: string
  content: JSONContent
  pinned: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 'all' | 'notes' (default folder) | 'deleted' | a folder id */
export type View = string
export type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline'
export type PendingDelete = { table: 'notes' | 'folders'; id: string }

type Persisted = {
  folders: Record<string, Folder>
  notes: Record<string, Note>
  dirtyNotes: Record<string, true>
  dirtyFolders: Record<string, true>
  pendingDeletes: PendingDelete[]
  view: View
  selectedNoteId: string | null
}

type State = Persisted & {
  userId: string | null
  loaded: boolean
  search: string
  syncStatus: SyncStatus

  load: (userId: string) => Promise<void>
  reset: (options?: { forget?: boolean }) => void
  setView: (view: View) => void
  setSearch: (q: string) => void
  setSyncStatus: (s: SyncStatus) => void

  createNote: (folderId?: string | null) => string
  selectNote: (id: string | null) => void
  updateNote: (id: string, patch: Partial<Note>) => void
  deleteNote: (id: string) => void
  recoverNote: (id: string) => void
  togglePin: (id: string) => void
  moveNote: (id: string, folderId: string | null) => void
  duplicateNote: (id: string) => string | null
  emptyTrash: () => void

  createFolder: (name?: string) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void

  applyRemoteNote: (row: Note) => void
  applyRemoteFolder: (row: Folder) => void
  applyRemoteDelete: (table: 'notes' | 'folders', id: string) => void
  mergeSnapshot: (folders: Folder[], notes: Note[], detectDeletes: boolean) => void
  markClean: (notes: Record<string, string>, folders: Record<string, string>, deletes: PendingDelete[]) => void
}

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }
export const TRASH_DAYS = 30

const nowIso = (): string => new Date().toISOString()
export const uuid = (): string => randomUUID()

const defaults: Persisted = {
  folders: {},
  notes: {},
  dirtyNotes: {},
  dirtyFolders: {},
  pendingDeletes: [],
  view: 'notes',
  selectedNoteId: null
}

// ---- change listeners (sync engine + editor) ----

let dirtyListener: () => void = () => {}
export function onDirty(fn: () => void): void {
  dirtyListener = fn
}

const remoteNoteListeners = new Set<(id: string) => void>()
/** The editor subscribes so a note open on screen updates when another device edits it. */
export function onRemoteNote(fn: (id: string) => void): () => void {
  remoteNoteListeners.add(fn)
  return () => remoteNoteListeners.delete(fn)
}

// ---- local persistence ----

const storageKey = (userId: string): string => `win-notes:${userId}`

async function readCache(userId: string): Promise<Partial<Persisted> | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : null
  } catch {
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 250)
}
export function saveNow(): void {
  clearTimeout(saveTimer)
  const s = useStore.getState()
  if (!s.userId || !s.loaded) return
  const data: Persisted = {
    folders: s.folders,
    notes: s.notes,
    dirtyNotes: s.dirtyNotes,
    dirtyFolders: s.dirtyFolders,
    pendingDeletes: s.pendingDeletes,
    view: s.view,
    selectedNoteId: s.selectedNoteId
  }
  AsyncStorage.setItem(storageKey(s.userId), JSON.stringify(data)).catch(() => {
    // Storage full or unavailable: the cloud copy is still the source of truth.
  })
}

// ---- helpers ----

export function isEmptyNote(n: Note): boolean {
  return !n.body.trim()
}

function normalizeNote(row: Note): Note {
  return {
    id: row.id,
    folder_id: row.folder_id ?? null,
    title: row.title ?? '',
    snippet: row.snippet ?? '',
    body: row.body ?? '',
    content: row.content && Object.keys(row.content).length ? row.content : EMPTY_DOC,
    pinned: !!row.pinned,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null
  }
}

function normalizeFolder(row: Folder): Folder {
  return {
    id: row.id,
    name: row.name,
    position: Number(row.position) || 0,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  }
}

/** Notes visible in a view, newest edit first, ignoring search. */
export function notesInView(state: Pick<State, 'notes' | 'view' | 'folders'>, view = state.view): Note[] {
  const all = Object.values(state.notes)
  let list: Note[]
  if (view === 'deleted') list = all.filter((n) => n.deleted_at)
  else if (view === 'all') list = all.filter((n) => !n.deleted_at)
  else if (view === 'notes') list = all.filter((n) => !n.deleted_at && (!n.folder_id || !state.folders[n.folder_id]))
  else list = all.filter((n) => !n.deleted_at && n.folder_id === view)
  return list.sort((a, b) => time(b.updated_at) - time(a.updated_at))
}

export function searchNotes(notes: Record<string, Note>, q: string): Note[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  return Object.values(notes)
    .filter((n) => !n.deleted_at)
    .filter((n) => {
      const hay = `${n.title}\n${n.body}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
    .sort((a, b) => time(b.updated_at) - time(a.updated_at))
}

export function visibleNotes(state: Pick<State, 'notes' | 'view' | 'folders' | 'search'>): Note[] {
  return state.search.trim() ? searchNotes(state.notes, state.search) : notesInView(state)
}

export function viewTitle(view: string, folders: Record<string, { name: string }>): string {
  if (view === 'all') return 'All Notes'
  if (view === 'notes') return 'Notes'
  if (view === 'deleted') return 'Recently Deleted'
  return folders[view]?.name ?? 'Notes'
}

// ---- store ----

export const useStore = create<State>()((set, get) => {
  const markNote = (id: string): Record<string, true> => ({ ...get().dirtyNotes, [id]: true })
  const markFolder = (id: string): Record<string, true> => ({ ...get().dirtyFolders, [id]: true })
  const changed = (): void => {
    scheduleSave()
    dirtyListener()
  }

  /** Remove a note from this device and queue the cloud delete. */
  const hardDeleteNote = (id: string): void => {
    const s = get()
    const notes = { ...s.notes }
    delete notes[id]
    const dirtyNotes = { ...s.dirtyNotes }
    delete dirtyNotes[id]
    set({
      notes,
      dirtyNotes,
      pendingDeletes: [...s.pendingDeletes, { table: 'notes', id }],
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId
    })
  }

  /** Discard the open note if it is still blank (called when leaving it). */
  const dropIfEmpty = (id: string | null): void => {
    if (!id) return
    const prev = get().notes[id]
    if (prev && isEmptyNote(prev) && !prev.deleted_at) hardDeleteNote(prev.id)
  }

  return {
    ...defaults,
    userId: null,
    loaded: false,
    search: '',
    syncStatus: 'local',

    load: async (userId) => {
      let cache = await readCache(userId)
      // First sign-in on this phone: bring over notes written in local-only mode.
      if (!cache && userId !== 'local') {
        const local = await readCache('local')
        if (local && Object.keys(local.notes ?? {}).length) {
          cache = {
            ...local,
            dirtyNotes: Object.fromEntries(Object.keys(local.notes ?? {}).map((id) => [id, true as const])),
            dirtyFolders: Object.fromEntries(Object.keys(local.folders ?? {}).map((id) => [id, true as const])),
            pendingDeletes: []
          }
          await AsyncStorage.removeItem(storageKey('local'))
        }
      }
      set({ ...defaults, ...cache, userId, loaded: true, search: '', selectedNoteId: null, syncStatus: userId === 'local' ? 'local' : 'connecting' })
      // Purge Recently Deleted after 30 days, like macOS.
      const cutoff = Date.now() - TRASH_DAYS * 86_400_000
      for (const n of Object.values(get().notes)) if (n.deleted_at && time(n.deleted_at) < cutoff) hardDeleteNote(n.id)
      const s = get()
      if (s.view !== 'all' && s.view !== 'notes' && s.view !== 'deleted' && !s.folders[s.view]) set({ view: 'notes' })
      changed()
    },

    // forget: on sign-out the account's notes leave this phone, unless a change has not reached the server yet;
    // then they stay, and upload the next time that account signs in here.
    reset: ({ forget = false } = {}) => {
      const { userId } = get()
      if (forget && userId && userId !== 'local' && !hasPendingChanges()) {
        clearTimeout(saveTimer)
        AsyncStorage.removeItem(storageKey(userId)).catch(() => {})
      } else saveNow()
      set({ ...defaults, userId: null, loaded: false, search: '', syncStatus: 'local' })
    },

    setView: (view) => {
      dropIfEmpty(get().selectedNoteId)
      set({ view, search: '', selectedNoteId: null })
      scheduleSave()
    },

    setSearch: (search) => set({ search }),

    setSyncStatus: (syncStatus) => {
      if (get().syncStatus !== syncStatus) set({ syncStatus })
    },

    createNote: (folderId) => {
      const s = get()
      dropIfEmpty(s.selectedNoteId)
      const view = s.view === 'deleted' ? 'notes' : s.view
      const folder = folderId !== undefined ? folderId : view !== 'all' && view !== 'notes' ? view : null
      const ts = nowIso()
      const note: Note = {
        id: uuid(),
        folder_id: folder && s.folders[folder] ? folder : null,
        title: '',
        snippet: '',
        body: '',
        content: EMPTY_DOC,
        pinned: false,
        created_at: ts,
        updated_at: ts,
        deleted_at: null
      }
      // Blank notes stay local until the first keystroke; this avoids syncing empties.
      set({ notes: { ...get().notes, [note.id]: note }, view, search: '', selectedNoteId: note.id })
      scheduleSave()
      return note.id
    },

    selectNote: (id) => {
      const s = get()
      if (s.selectedNoteId === id) return
      dropIfEmpty(s.selectedNoteId)
      set({ selectedNoteId: id })
      scheduleSave()
      if (s.selectedNoteId) dirtyListener()
    },

    updateNote: (id, patch) => {
      const note = get().notes[id]
      if (!note) return
      set({ notes: { ...get().notes, [id]: { ...note, ...patch, updated_at: nowIso() } }, dirtyNotes: markNote(id) })
      changed()
    },

    deleteNote: (id) => {
      const note = get().notes[id]
      if (!note) return
      if (note.deleted_at || isEmptyNote(note)) {
        hardDeleteNote(id)
      } else {
        set({
          notes: { ...get().notes, [id]: { ...note, deleted_at: nowIso(), pinned: false, updated_at: nowIso() } },
          dirtyNotes: markNote(id)
        })
      }
      if (get().selectedNoteId === id) set({ selectedNoteId: null })
      changed()
    },

    recoverNote: (id) => {
      const note = get().notes[id]
      if (!note) return
      const folderId = note.folder_id && get().folders[note.folder_id] ? note.folder_id : null
      set({
        notes: { ...get().notes, [id]: { ...note, deleted_at: null, folder_id: folderId, updated_at: nowIso() } },
        dirtyNotes: markNote(id)
      })
      changed()
    },

    togglePin: (id) => {
      const note = get().notes[id]
      if (!note || note.deleted_at) return
      // Pinning does not count as an edit in macOS Notes, so keep the list order stable.
      set({
        notes: { ...get().notes, [id]: { ...note, pinned: !note.pinned, updated_at: new Date(time(note.updated_at) + 1).toISOString() } },
        dirtyNotes: markNote(id)
      })
      changed()
    },

    moveNote: (id, folderId) => {
      const note = get().notes[id]
      if (!note) return
      set({
        notes: { ...get().notes, [id]: { ...note, folder_id: folderId, deleted_at: null, updated_at: new Date(time(note.updated_at) + 1).toISOString() } },
        dirtyNotes: markNote(id)
      })
      changed()
    },

    duplicateNote: (id) => {
      const note = get().notes[id]
      if (!note) return null
      const ts = nowIso()
      const copy: Note = { ...note, id: uuid(), pinned: false, deleted_at: null, created_at: ts, updated_at: ts }
      set({ notes: { ...get().notes, [copy.id]: copy }, dirtyNotes: markNote(copy.id) })
      changed()
      return copy.id
    },

    emptyTrash: () => {
      for (const n of Object.values(get().notes)) if (n.deleted_at) hardDeleteNote(n.id)
      changed()
    },

    createFolder: (name = 'New Folder') => {
      const s = get()
      const used = new Set(Object.values(s.folders).map((f) => f.name))
      let unique = name.trim().slice(0, 200) || 'New Folder'
      for (let i = 2; used.has(unique); i++) unique = `${name} ${i}`
      const ts = nowIso()
      const position = Math.max(0, ...Object.values(s.folders).map((f) => f.position)) + 1
      const folder: Folder = { id: uuid(), name: unique, position, created_at: ts, updated_at: ts }
      set({ folders: { ...s.folders, [folder.id]: folder }, dirtyFolders: markFolder(folder.id) })
      changed()
      return folder.id
    },

    renameFolder: (id, name) => {
      const folder = get().folders[id]
      const trimmed = name.trim().slice(0, 200)
      if (!folder || !trimmed || trimmed === folder.name) return
      set({ folders: { ...get().folders, [id]: { ...folder, name: trimmed, updated_at: nowIso() } }, dirtyFolders: markFolder(id) })
      changed()
    },

    deleteFolder: (id) => {
      const s = get()
      if (!s.folders[id]) return
      const ts = nowIso()
      const notes = { ...s.notes }
      const dirtyNotes = { ...s.dirtyNotes }
      // Like macOS: the folder's notes go to Recently Deleted.
      for (const n of Object.values(notes)) {
        if (n.folder_id !== id) continue
        notes[n.id] = { ...n, folder_id: null, deleted_at: n.deleted_at ?? ts, pinned: false, updated_at: ts }
        dirtyNotes[n.id] = true
      }
      const folders = { ...s.folders }
      delete folders[id]
      const dirtyFolders = { ...s.dirtyFolders }
      delete dirtyFolders[id]
      set({ folders, notes, dirtyNotes, dirtyFolders, pendingDeletes: [...s.pendingDeletes, { table: 'folders', id }] })
      if (s.view === id) set({ view: 'notes', selectedNoteId: null })
      changed()
    },

    applyRemoteNote: (raw) => {
      const row = normalizeNote(raw)
      const s = get()
      const local = s.notes[row.id]
      if (s.pendingDeletes.some((d) => d.table === 'notes' && d.id === row.id)) return
      // Last write wins; equal timestamps are our own echo.
      if (local && time(local.updated_at) >= time(row.updated_at)) return
      const dirtyNotes = { ...s.dirtyNotes }
      delete dirtyNotes[row.id]
      set({ notes: { ...s.notes, [row.id]: row }, dirtyNotes })
      scheduleSave()
      remoteNoteListeners.forEach((fn) => fn(row.id))
    },

    applyRemoteFolder: (raw) => {
      const row = normalizeFolder(raw)
      const s = get()
      const local = s.folders[row.id]
      if (s.pendingDeletes.some((d) => d.table === 'folders' && d.id === row.id)) return
      if (local && time(local.updated_at) >= time(row.updated_at)) return
      const dirtyFolders = { ...s.dirtyFolders }
      delete dirtyFolders[row.id]
      set({ folders: { ...s.folders, [row.id]: row }, dirtyFolders })
      scheduleSave()
    },

    applyRemoteDelete: (table, id) => {
      const s = get()
      if (table === 'notes') {
        if (!s.notes[id]) return
        const notes = { ...s.notes }
        delete notes[id]
        const dirtyNotes = { ...s.dirtyNotes }
        delete dirtyNotes[id]
        set({ notes, dirtyNotes, selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId })
      } else {
        if (!s.folders[id]) return
        const folders = { ...s.folders }
        delete folders[id]
        const dirtyFolders = { ...s.dirtyFolders }
        delete dirtyFolders[id]
        set({ folders, dirtyFolders })
        if (s.view === id) set({ view: 'notes', selectedNoteId: null })
      }
      scheduleSave()
    },

    mergeSnapshot: (folders, notes, detectDeletes) => {
      for (const f of folders) get().applyRemoteFolder(f)
      for (const n of notes) get().applyRemoteNote(n)
      if (!detectDeletes) return
      // Anything clean locally but missing remotely was deleted on another device.
      const remoteNotes = new Set(notes.map((n) => n.id))
      const remoteFolders = new Set(folders.map((f) => f.id))
      const s = get()
      for (const id of Object.keys(s.notes)) {
        const n = s.notes[id]
        if (!remoteNotes.has(id) && !s.dirtyNotes[id] && !(isEmptyNote(n) && id === s.selectedNoteId)) get().applyRemoteDelete('notes', id)
      }
      for (const id of Object.keys(s.folders)) if (!remoteFolders.has(id) && !s.dirtyFolders[id]) get().applyRemoteDelete('folders', id)
    },

    markClean: (notesSent, foldersSent, deletes) => {
      const s = get()
      const dirtyNotes = { ...s.dirtyNotes }
      const dirtyFolders = { ...s.dirtyFolders }
      // Only clear rows not edited again while the upload was in flight.
      for (const [id, ts] of Object.entries(notesSent)) if (s.notes[id]?.updated_at === ts || !s.notes[id]) delete dirtyNotes[id]
      for (const [id, ts] of Object.entries(foldersSent)) if (s.folders[id]?.updated_at === ts || !s.folders[id]) delete dirtyFolders[id]
      const done = new Set(deletes.map((d) => `${d.table}:${d.id}`))
      set({ dirtyNotes, dirtyFolders, pendingDeletes: s.pendingDeletes.filter((d) => !done.has(`${d.table}:${d.id}`)) })
      scheduleSave()
    }
  }
})

export function hasPendingChanges(): boolean {
  const s = useStore.getState()
  return Object.keys(s.dirtyNotes).length > 0 || Object.keys(s.dirtyFolders).length > 0 || s.pendingDeletes.length > 0
}
