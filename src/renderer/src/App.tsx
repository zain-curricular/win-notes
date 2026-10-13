import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'motion/react'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import { flushNow, startSync, stopSync } from './lib/sync'
import { Sidebar } from './components/Sidebar'
import { Gallery, ListHeader, NoteList } from './components/NoteList'
import { EditorPane } from './components/Editor'
import { AuthScreen } from './components/Auth'
import { ContextMenuLayer, isMac, isMod } from './components/ui'

const MODE_KEY = 'win-notes:mode'

function useAppShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      const key = e.key.toLowerCase()
      // Sidebar: Ctrl-Cmd-S on Mac, Ctrl-Alt-S on Windows.
      if (key === 's' && (isMac ? e.metaKey && e.ctrlKey : e.ctrlKey && e.altKey)) {
        e.preventDefault()
        s.toggleSidebar()
        return
      }
      if (!isMod(e)) {
        if (e.key === 'Escape' && s.layout === 'gallery' && s.galleryOpen) s.setGalleryOpen(false)
        return
      }
      if (key === 'n' && e.shiftKey) {
        e.preventDefault()
        s.createFolder()
      } else if (key === 'n') {
        e.preventDefault()
        s.createNote()
      } else if (key === 'f') {
        // Cmd/Ctrl-F and Option-Cmd/Ctrl-Alt-F both search all notes.
        e.preventDefault()
        window.dispatchEvent(new Event('notes:focus-search'))
      } else if (e.key === '1' && !e.shiftKey) {
        e.preventDefault()
        s.setLayout('list')
      } else if (e.key === '2' && !e.shiftKey) {
        e.preventDefault()
        s.setLayout('gallery')
      } else if (key === 'd' && !e.shiftKey && s.selectedNoteId) {
        e.preventDefault()
        s.duplicateNote(s.selectedNoteId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Shell({ email, onSignOut, onSignIn }: { email?: string; onSignOut: () => void; onSignIn: () => void }): ReactNode {
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const layout = useStore((s) => s.layout)
  const galleryOpen = useStore((s) => s.galleryOpen)
  const hasSelection = useStore((s) => !!s.selectedNoteId)
  useAppShortcuts()

  const galleryMode = layout === 'gallery'
  const showGalleryEditor = galleryMode && galleryOpen && hasSelection

  return (
    <div className="shell" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <motion.div
        className="sidebar-wrap"
        initial={false}
        animate={{ width: sidebarOpen ? 'var(--sidebar-w)' : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 42 }}
      >
        <Sidebar email={email} onSignOut={onSignOut} onSignIn={onSignIn} />
      </motion.div>
      <div className="main">
        {galleryMode ? (
          <AnimatePresence mode="wait" initial={false}>
            {showGalleryEditor ? (
              <motion.div key="g-editor" className="gallery-editor" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.16 }}>
                <EditorPane onBack={() => useStore.getState().setGalleryOpen(false)} />
              </motion.div>
            ) : (
              <motion.div key="g-grid" className="gallery-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                <ListHeader withToggle gallery />
                <Gallery />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <>
            <NoteList />
            <EditorPane />
          </>
        )}
      </div>
      <ContextMenuLayer />
    </div>
  )
}

export default function App(): ReactNode {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [localMode, setLocalMode] = useState(() => localStorage.getItem(MODE_KEY) === 'local')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? (localMode || !supabase ? 'local' : null)

  useEffect(() => {
    if (!userId) return
    if (userId !== 'local') localStorage.removeItem(MODE_KEY)
    useStore.getState().load(userId)
    if (userId !== 'local') startSync(userId)
    return () => {
      stopSync()
      useStore.getState().reset()
    }
  }, [userId])

  const signOut = async (): Promise<void> => {
    await flushNow().catch(() => {})
    await supabase?.auth.signOut()
  }
  const signIn = (): void => {
    localStorage.removeItem(MODE_KEY)
    setLocalMode(false)
  }

  if (session === undefined) return <div className="boot" />

  return (
    <AnimatePresence mode="wait">
      {userId ? (
        <motion.div key={`shell-${userId}`} className="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Shell email={session?.user.email} onSignOut={signOut} onSignIn={signIn} />
        </motion.div>
      ) : (
        <motion.div key="auth" className="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <AuthScreen
            onOffline={() => {
              localStorage.setItem(MODE_KEY, 'local')
              setLocalMode(true)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
