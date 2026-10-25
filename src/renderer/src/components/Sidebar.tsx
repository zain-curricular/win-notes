import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Cloud, CloudOff, Download, Folder, FolderPlus, HardDrive, Keyboard, KeyRound, LogOut, PanelLeft, RefreshCw, Trash2, UserRound, X } from 'lucide-react'
import { useStore, type View } from '../lib/store'
import { openContextMenu, Popover, ToolButton } from './ui'
import { shortcuts } from '../lib/shortcuts'
import { OPEN_SHORTCUTS } from './ShortcutSettings'
import { OPEN_VAULT } from './VaultSheet'

const NOTE_MIME = 'application/x-note-id'

function FolderRow({
  view,
  name,
  count,
  icon,
  droppable,
  editable
}: {
  view: View
  name: string
  count: number
  icon: ReactNode
  droppable?: boolean
  editable?: boolean
}): ReactNode {
  const active = useStore((s) => s.view === view && !s.search.trim())
  const renaming = useStore((s) => s.renamingFolderId === view)
  const { setView, moveNote, renameFolder, deleteFolder, setRenamingFolder, createNote } = useStore.getState()
  const [over, setOver] = useState(false)

  const commit = (value: string): void => {
    renameFolder(view, value)
    setRenamingFolder(null)
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
      className={`folder-row${active ? ' active' : ''}${over ? ' drop-over' : ''}`}
      onClick={() => setView(view)}
      onDoubleClick={() => editable && setRenamingFolder(view)}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: 'New Note', onSelect: () => (setView(view === 'deleted' ? 'notes' : view), createNote()) },
          ...(editable
            ? ([
                'separator',
                { label: 'Rename Folder', onSelect: () => setRenamingFolder(view) },
                { label: 'Delete Folder', danger: true, onSelect: () => deleteFolder(view) }
              ] as const)
            : [])
        ])
      }
      onDragOver={(e) => {
        if (!droppable || !e.dataTransfer.types.includes(NOTE_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData(NOTE_MIME)
        if (id) moveNote(id, view === 'notes' ? null : view)
      }}
    >
      <span className="folder-icon">{icon}</span>
      {renaming ? (
        <input
          className="folder-rename"
          defaultValue={name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value)
            if (e.key === 'Escape') setRenamingFolder(null)
          }}
        />
      ) : (
        <span className="folder-name">{name}</span>
      )}
      <span className="folder-count">{count || ''}</span>
    </motion.div>
  )
}

function SyncBadge(): ReactNode {
  const status = useStore((s) => s.syncStatus)
  const map = {
    local: { icon: <HardDrive size={13} />, label: 'On this computer' },
    connecting: { icon: <RefreshCw size={13} className="spin" />, label: 'Connecting…' },
    syncing: { icon: <RefreshCw size={13} className="spin" />, label: 'Syncing…' },
    synced: { icon: <Cloud size={13} />, label: 'Synced' },
    offline: { icon: <CloudOff size={13} />, label: 'Offline — saved locally' }
  }[status]
  return (
    <div className={`sync-badge sync-${status}`} title={map.label}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={status} className="sync-inner" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}>
          {map.icon}
          <span>{map.label}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

const DISMISSED_UPDATE_KEY = 'win-notes:dismissed-update'

function UpdateNotice(): ReactNode {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null)
  useEffect(() => {
    window.updates?.check().then((u) => {
      if (u && localStorage.getItem(DISMISSED_UPDATE_KEY) !== u.version) setUpdate(u)
    })
  }, [])
  if (!update) return null
  return (
    <div className="update-notice">
      <a href={update.url} target="_blank" rel="noreferrer">
        <Download size={14} /> Notes {update.version} is available
      </a>
      <button aria-label="Dismiss" onClick={() => (localStorage.setItem(DISMISSED_UPDATE_KEY, update.version), setUpdate(null))}>
        <X size={13} />
      </button>
    </div>
  )
}

function AccountButton({ email, onSignOut, onSignIn }: { email?: string; onSignOut: () => void; onSignIn: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <ToolButton label="Account" buttonRef={ref} onClick={() => setOpen((o) => !o)} active={open}>
        <UserRound size={16} />
      </ToolButton>
      <Popover open={open} anchor={ref} onClose={() => setOpen(false)} className="account-pop">
        {email ? (
          <>
            <div className="account-email">{email}</div>
            <div className="account-hint">Notes sync instantly to every computer signed in to this account.</div>
            <button className="pop-action" onClick={() => (setOpen(false), window.dispatchEvent(new Event(OPEN_SHORTCUTS)))}>
              <Keyboard size={14} /> Keyboard Shortcuts…
            </button>
            <button className="pop-action" onClick={() => (setOpen(false), window.dispatchEvent(new Event(OPEN_VAULT)))}>
              <KeyRound size={14} /> Secure Vault…
            </button>
            <button className="pop-action danger" onClick={() => (setOpen(false), onSignOut())}>
              <LogOut size={14} /> Sign Out
            </button>
          </>
        ) : (
          <>
            <div className="account-email">Not signed in</div>
            <div className="account-hint">Your notes are saved only on this computer.</div>
            <button className="pop-action" onClick={() => (setOpen(false), window.dispatchEvent(new Event(OPEN_SHORTCUTS)))}>
              <Keyboard size={14} /> Keyboard Shortcuts…
            </button>
            <button className="pop-action" onClick={() => (setOpen(false), window.dispatchEvent(new Event(OPEN_VAULT)))}>
              <KeyRound size={14} /> Secure Vault…
            </button>
            <button className="pop-action" onClick={() => (setOpen(false), onSignIn())}>
              <Cloud size={14} /> Sign In to Sync…
            </button>
          </>
        )}
      </Popover>
    </>
  )
}

export function Sidebar({ email, onSignOut, onSignIn }: { email?: string; onSignOut: () => void; onSignIn: () => void }): ReactNode {
  const folders = useStore((s) => s.folders)
  const notes = useStore((s) => s.notes)
  const { createFolder, toggleSidebar } = useStore.getState()

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, notes: 0, deleted: 0 }
    for (const n of Object.values(notes)) {
      if (n.deleted_at) {
        c.deleted++
        continue
      }
      c.all++
      const key = n.folder_id && folders[n.folder_id] ? n.folder_id : 'notes'
      c[key] = (c[key] ?? 0) + 1
    }
    return c
  }, [notes, folders])

  const sorted = useMemo(
    () => Object.values(folders).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folders]
  )

  const folderIcon = <Folder size={16} strokeWidth={1.8} />

  return (
    <div className="sidebar">
      <div className="topbar sidebar-top">
        <div className="drag-spacer" />
        <ToolButton label="Hide Sidebar" shortcut={shortcuts.label('toggleSidebar')} onClick={toggleSidebar}>
          <PanelLeft size={17} />
        </ToolButton>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">{email ? 'Cloud' : 'On My Computer'}</div>
        <FolderRow view="all" name="All Notes" count={counts.all} icon={folderIcon} />
        <FolderRow view="notes" name="Notes" count={counts.notes} icon={folderIcon} droppable />
        <AnimatePresence initial={false}>
          {sorted.map((f) => (
            <FolderRow key={f.id} view={f.id} name={f.name} count={counts[f.id] ?? 0} icon={folderIcon} droppable editable />
          ))}
          {counts.deleted > 0 ? (
            <FolderRow key="deleted" view="deleted" name="Recently Deleted" count={counts.deleted} icon={<Trash2 size={16} strokeWidth={1.8} />} />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="sidebar-bottom">
        <UpdateNotice />
        <button className="new-folder" onClick={() => createFolder()} title={`New Folder (${shortcuts.label('newFolder')})`}>
          <FolderPlus size={16} />
          <span>New Folder</span>
        </button>
        <div className="sidebar-bottom-row">
          <SyncBadge />
          <AccountButton email={email} onSignOut={onSignOut} onSignIn={onSignIn} />
        </div>
      </div>
    </div>
  )
}
