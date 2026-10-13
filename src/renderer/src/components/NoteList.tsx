import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Folder, LayoutGrid, List, PanelLeft, Pin, SquarePen, Trash2 } from 'lucide-react'
import { SearchField } from './SearchField'
import { useStore, visibleNotes, type Note } from '../lib/store'
import { groupLabel, rowDate } from '../lib/dates'
import { isMac, kbd, openContextMenu, ToolButton, type MenuItem } from './ui'

const NOTE_MIME = 'application/x-note-id'

export function viewTitle(view: string, folders: Record<string, { name: string }>, search: string): string {
  if (search.trim()) return 'Search'
  if (view === 'all') return 'All Notes'
  if (view === 'notes') return 'Notes'
  if (view === 'deleted') return 'Recently Deleted'
  return folders[view]?.name ?? 'Notes'
}

export function noteMenu(note: Note): MenuItem[] {
  const s = useStore.getState()
  if (note.deleted_at) {
    return [
      { label: 'Recover', onSelect: () => s.recoverNote(note.id) },
      'separator',
      { label: 'Delete Permanently', danger: true, onSelect: () => s.deleteNote(note.id) }
    ]
  }
  const folders = Object.values(s.folders).sort((a, b) => a.position - b.position)
  return [
    { label: note.pinned ? 'Unpin Note' : 'Pin Note', icon: <Pin size={14} />, onSelect: () => s.togglePin(note.id) },
    {
      label: 'Move To',
      submenu: [
        { label: 'Notes', checked: !note.folder_id || !s.folders[note.folder_id], onSelect: () => s.moveNote(note.id, null) },
        ...folders.map((f) => ({ label: f.name, checked: note.folder_id === f.id, onSelect: () => s.moveNote(note.id, f.id) }))
      ]
    },
    { label: 'Duplicate Note', shortcut: kbd('D'), onSelect: () => s.duplicateNote(note.id) },
    'separator',
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => s.deleteNote(note.id) }
  ]
}

function groupNotes(notes: Note[], pinFirst: boolean): { label: string; notes: Note[] }[] {
  const groups: { label: string; notes: Note[] }[] = []
  const pinned = pinFirst ? notes.filter((n) => n.pinned) : []
  if (pinned.length) groups.push({ label: 'Pinned', notes: pinned })
  for (const n of notes) {
    if (pinFirst && n.pinned) continue
    const label = groupLabel(n.updated_at)
    const last = groups.at(-1)
    if (last && last.label === label) last.notes.push(n)
    else groups.push({ label, notes: [n] })
  }
  return groups
}

function NoteRow({ note, showFolder }: { note: Note; showFolder: boolean }): ReactNode {
  const selected = useStore((s) => s.selectedNoteId === note.id)
  const folderName = useStore((s) => (note.folder_id ? s.folders[note.folder_id]?.name : undefined) ?? 'Notes')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }}
      className={`note-row${selected ? ' selected' : ''}`}
      draggable={!note.deleted_at}
      onDragStart={(e) => {
        const dt = (e as unknown as React.DragEvent).dataTransfer
        dt.setData(NOTE_MIME, note.id)
        dt.effectAllowed = 'move'
      }}
      onClick={() => useStore.getState().selectNote(note.id)}
      onDoubleClick={() => useStore.getState().requestEditorFocus()}
      onContextMenu={(e) => {
        useStore.getState().selectNote(note.id)
        openContextMenu(e, noteMenu(note))
      }}
    >
      <div className="note-title">{note.title || 'New Note'}</div>
      <div className="note-meta">
        <span className="note-date">{rowDate(note.updated_at)}</span>
        <span className="note-snippet">{note.snippet || 'No additional text'}</span>
      </div>
      {showFolder ? (
        <div className="note-folder">
          <Folder size={12} />
          {folderName}
        </div>
      ) : null}
    </motion.div>
  )
}

function useListKeys(notes: Note[]): (e: React.KeyboardEvent) => void {
  return (e) => {
    const s = useStore.getState()
    const i = notes.findIndex((n) => n.id === s.selectedNoteId)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = notes[Math.max(0, Math.min(notes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) s.selectNote(next.id)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedNoteId) {
      e.preventDefault()
      s.deleteNote(s.selectedNoteId)
    } else if (e.key === 'Enter' && s.selectedNoteId) {
      e.preventDefault()
      s.requestEditorFocus()
    }
  }
}

function EmptyList({ view }: { view: string }): ReactNode {
  return (
    <motion.div className="empty-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
      {view === 'deleted' ? 'No Recently Deleted Notes' : 'No Notes'}
    </motion.div>
  )
}

export function ListHeader({ withToggle, gallery }: { withToggle?: boolean; gallery?: boolean }): ReactNode {
  const view = useStore((s) => s.view)
  const search = useStore((s) => s.search)
  const folders = useStore((s) => s.folders)
  const layout = useStore((s) => s.layout)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const selected = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] : null))
  const count = useStore((s) => visibleNotes(s).length)
  const { setLayout, deleteNote, toggleSidebar, emptyTrash, createNote } = useStore.getState()

  return (
    <div className="topbar list-top">
      {!sidebarOpen && withToggle ? (
        <ToolButton label="Show Sidebar" shortcut={isMac ? '⌃⌘S' : kbd('Alt', 'S')} onClick={toggleSidebar}>
          <PanelLeft size={17} />
        </ToolButton>
      ) : null}
      <div className="list-heading">
        <div className="list-title">{viewTitle(view, folders, search)}</div>
        <div className="list-count">
          {count} {count === 1 ? 'note' : 'notes'}
        </div>
      </div>
      <div className="segmented">
        <button className={layout === 'list' ? 'on' : ''} title={`List (${kbd('1')})`} onClick={() => setLayout('list')}>
          <List size={15} />
        </button>
        <button className={layout === 'gallery' ? 'on' : ''} title={`Gallery (${kbd('2')})`} onClick={() => setLayout('gallery')}>
          <LayoutGrid size={15} />
        </button>
      </div>
      {view === 'deleted' && !search ? (
        <button className="text-btn" onClick={emptyTrash} disabled={!count}>
          Delete All
        </button>
      ) : (
        <ToolButton label="Delete" disabled={!selected} onClick={() => selected && deleteNote(selected.id)}>
          <Trash2 size={16} />
        </ToolButton>
      )}
      {gallery ? (
        <>
          <ToolButton label="New Note" shortcut={kbd('N')} onClick={() => createNote()}>
            <SquarePen size={17} />
          </ToolButton>
          <SearchField />
        </>
      ) : null}
    </div>
  )
}

export function NoteList(): ReactNode {
  const state = useStore()
  const notes = useMemo(() => visibleNotes(state), [state.notes, state.view, state.search, state.folders])
  const groups = useMemo(() => groupNotes(notes, state.view !== 'deleted'), [notes, state.view])
  const showFolder = state.view === 'all' || !!state.search.trim()
  const onKeyDown = useListKeys(notes)

  return (
    <div className="note-list">
      <ListHeader withToggle />
      <div className="note-list-scroll" tabIndex={0} onKeyDown={onKeyDown}>
        {notes.length === 0 ? <EmptyList view={state.view} /> : null}
        <AnimatePresence initial={false}>
          {groups.flatMap((g) => [
            <motion.div key={`h-${g.label}`} layout="position" className="group-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {g.label === 'Pinned' ? <Pin size={12} className="pin-ico" /> : null}
              {g.label}
            </motion.div>,
            ...g.notes.map((n) => <NoteRow key={n.id} note={n} showFolder={showFolder} />)
          ])}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function Gallery(): ReactNode {
  const state = useStore()
  const notes = useMemo(() => visibleNotes(state), [state.notes, state.view, state.search, state.folders])
  const groups = useMemo(() => groupNotes(notes, state.view !== 'deleted'), [notes, state.view])
  const onKeyDown = useListKeys(notes)
  const { selectNote, setGalleryOpen } = useStore.getState()

  return (
    <div className="gallery" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' ? setGalleryOpen(true) : onKeyDown(e))}>
      {notes.length === 0 ? <EmptyList view={state.view} /> : null}
      {groups.map((g) => (
        <section key={g.label}>
          <div className="group-label">{g.label}</div>
          <div className="gallery-grid">
            <AnimatePresence initial={false}>
              {g.notes.map((n) => (
                <motion.button
                  key={n.id}
                  layout
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  className={`gallery-card${state.selectedNoteId === n.id ? ' selected' : ''}`}
                  onClick={() => selectNote(n.id)}
                  onDoubleClick={() => (selectNote(n.id), setGalleryOpen(true))}
                  onContextMenu={(e) => (selectNote(n.id), openContextMenu(e, noteMenu(n)))}
                  draggable={!n.deleted_at}
                  onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData(NOTE_MIME, n.id)}
                >
                  <div className="gallery-paper">
                    <div className="gallery-paper-title">{n.title}</div>
                    <div className="gallery-paper-body">{n.body.split('\n').slice(1).join('\n')}</div>
                  </div>
                  <div className="gallery-title">{n.title || 'New Note'}</div>
                  <div className="gallery-date">{rowDate(n.updated_at)}</div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  )
}
