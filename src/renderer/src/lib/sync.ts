import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { hasPendingChanges, onDirty, useStore, type Folder, type Note, type PendingDelete } from './store'

const PUSH_DELAY = 120
const RETRY_DELAY = 4000

let userId: string | null = null
let channel: RealtimeChannel | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pushing = false
let generation = 0
let lastPushDone = 0

const status = useStore.getState().setSyncStatus

function schedulePush(delay = PUSH_DELAY): void {
  if (!userId) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, delay)
}

async function push(): Promise<void> {
  if (!supabase || !userId) return
  if (pushing) {
    schedulePush()
    return
  }
  if (!hasPendingChanges()) return
  const gen = generation
  pushing = true
  status('syncing')
  const s = useStore.getState()
  const folderRows = Object.keys(s.dirtyFolders)
    .map((id) => s.folders[id])
    .filter((f): f is Folder => !!f)
    .map((f) => ({ ...f, user_id: userId }))
  const noteRows = Object.keys(s.dirtyNotes)
    .map((id) => s.notes[id])
    .filter((n): n is Note => !!n)
    .map((n) => ({ ...n, user_id: userId }))
  const deletes: PendingDelete[] = [...s.pendingDeletes]
  const sentNotes = Object.fromEntries(noteRows.map((n) => [n.id, n.updated_at]))
  const sentFolders = Object.fromEntries(folderRows.map((f) => [f.id, f.updated_at]))

  try {
    if (folderRows.length) {
      const { error } = await supabase.from('folders').upsert(folderRows)
      if (error) throw error
    }
    if (noteRows.length) {
      const { error } = await supabase.from('notes').upsert(noteRows)
      if (error) throw error
    }
    for (const table of ['notes', 'folders'] as const) {
      const ids = deletes.filter((d) => d.table === table).map((d) => d.id)
      if (!ids.length) continue
      const { error } = await supabase.from(table).delete().in('id', ids)
      if (error) throw error
    }
    if (gen !== generation) return
    lastPushDone = Date.now()
    useStore.getState().markClean(sentNotes, sentFolders, deletes)
    status(hasPendingChanges() ? 'syncing' : 'synced')
  } catch (err) {
    console.warn('[sync] push failed', err)
    if (gen !== generation) return
    status('offline')
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => schedulePush(0), RETRY_DELAY)
  } finally {
    pushing = false
    if (gen === generation && hasPendingChanges()) schedulePush()
  }
}

async function pull(): Promise<boolean> {
  if (!supabase || !userId) return false
  const gen = generation
  const startedAt = Date.now()
  const [folders, notes] = await Promise.all([
    supabase.from('folders').select('*'),
    supabase.from('notes').select('*')
  ])
  if (gen !== generation) return false
  if (folders.error || notes.error) {
    console.warn('[sync] pull failed', folders.error ?? notes.error)
    return false
  }
  // If an upload finished mid-pull, the snapshot may predate it; skip delete detection this time.
  const safeToDelete = !pushing && lastPushDone < startedAt
  useStore.getState().mergeSnapshot(folders.data as Folder[], notes.data as Note[], safeToDelete)
  return true
}

function subscribe(): void {
  if (!supabase || !userId) return
  const uid = userId
  const filter = `user_id=eq.${uid}`
  channel = supabase
    .channel(`notes-sync-${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes', filter }, (p) =>
      useStore.getState().applyRemoteNote(p.new as Note)
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes', filter }, (p) =>
      useStore.getState().applyRemoteNote(p.new as Note)
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'folders', filter }, (p) =>
      useStore.getState().applyRemoteFolder(p.new as Folder)
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'folders', filter }, (p) =>
      useStore.getState().applyRemoteFolder(p.new as Folder)
    )
    // Delete events cannot be filtered; they only carry the id, and ids are random UUIDs.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, (p) => {
      const id = (p.old as { id?: string }).id
      if (id) useStore.getState().applyRemoteDelete('notes', id)
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'folders' }, (p) => {
      const id = (p.old as { id?: string }).id
      if (id) useStore.getState().applyRemoteDelete('folders', id)
    })
    .subscribe(async (state) => {
      if (state === 'SUBSCRIBED') {
        // Catch anything missed while disconnected, then upload local edits.
        const ok = await pull()
        status(ok ? (hasPendingChanges() ? 'syncing' : 'synced') : 'offline')
        schedulePush(0)
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        if (userId === uid) status('offline')
      }
    })
}

/** Resubscribing triggers a catch-up pull, so this only acts when the live connection dropped. */
function handleOnline(): void {
  if (!userId) return
  if (channel && channel.state === 'joined') {
    schedulePush(0)
    return
  }
  if (channel) supabase?.removeChannel(channel)
  subscribe()
}

export function startSync(uid: string): void {
  stopSync()
  if (!supabase) return
  userId = uid
  generation++
  status('connecting')
  onDirty(() => schedulePush())
  subscribe()
  window.addEventListener('online', handleOnline)
  window.addEventListener('focus', handleOnline)
}

export function stopSync(): void {
  generation++
  userId = null
  clearTimeout(pushTimer)
  clearTimeout(retryTimer)
  onDirty(() => {})
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('focus', handleOnline)
  if (channel && supabase) supabase.removeChannel(channel)
  channel = null
}

/** Upload anything pending right now (used before signing out). */
export async function flushNow(): Promise<void> {
  clearTimeout(pushTimer)
  await push()
}
