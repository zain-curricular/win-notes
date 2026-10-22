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
import { ContextMenuLayer } from './components/ui'
import { shortcuts, type AppShortcutId } from './lib/shortcuts'

const MODE_KEY = 'win-notes:mode'

function useAppShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      const on = (id: AppShortcutId): boolean => shortcuts.matches(e, id)
      if (on('toggleSidebar')) s.toggleSidebar()
      else if (on('newFolder')) s.createFolder()
      else if (on('newNote')) s.createNote()
      else if (on('search')) window.dispatchEvent(new Event('notes:focus-search'))
      else if (on('listLayout')) s.setLayout('list')
      else if (on('galleryLayout')) s.setLayout('gallery')
      else if (on('duplicateNote') && s.selectedNoteId) s.duplicateNote(s.selectedNoteId)
      else {
        if (on('closeGallery') && s.layout === 'gallery' && s.galleryOpen) s.setGalleryOpen(false)
        return
      }
      e.preventDefault()
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
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  // Confirmation emails open winnotes://auth-callback#access_token=…&refresh_token=…
  useEffect(() => {
    if (!supabase || !window.deepLinks) return
    const client = supabase
    const handle = async (url: string | null): Promise<void> => {
      if (!url) return
      const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '')
      const error = params.get('error_description')
      if (error) {
        setAuthNotice(error.replace(/\+/g, ' '))
        return
      }
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (!access_token || !refresh_token) return
      const { error: sessionError } = await client.auth.setSession({ access_token, refresh_token })
      if (sessionError) setAuthNotice(`${sessionError.message}. Sign in with your email and password.`)
    }
    window.deepLinks.take().then(handle)
    return window.deepLinks.on(handle)
  }, [])

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
            key={authNotice ?? 'auth'}
            notice={authNotice}
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
