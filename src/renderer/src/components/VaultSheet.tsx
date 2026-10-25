import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Copy, Eye, EyeOff, Lock, Pencil, Plus, Search, Trash2, Wand2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { DEFAULT_GENERATOR, generatePassword, MAX_LENGTH, MIN_LENGTH, type GeneratorOptions } from '../lib/passwordGenerator'

export const OPEN_VAULT = 'notes:open-vault'
const MIN_MASTER = 12
const UNDERSTOOD = 'I understand'

type Mode = 'loading' | 'none' | 'locked' | 'unlocked'
type Summary = { id: string; title: string; username: string; url: string; updatedAt: string }
type Draft = { id?: string; title: string; username: string; password: string; url: string; notes: string }
const EMPTY_DRAFT: Draft = { title: '', username: '', password: '', url: '', notes: '' }

const MESSAGES: Record<string, string> = {
  'unlock-failed': 'Wrong master password, or the vault file is damaged.',
  'weak-password': `The master password needs at least ${MIN_MASTER} characters.`,
  exists: 'This account already has a vault.',
  'invalid-entry': 'Each entry needs a title, and a website must start with http:// or https://.',
  'invalid-file': 'The vault file could not be read.',
  'weak-kdf': 'The vault file was changed and has not been opened.',
  'not-found': 'That entry no longer exists.'
}

const host = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export function VaultSheet(): ReactNode {
  const accountId = useStore((s) => s.userId)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [master, setMaster] = useState('')
  const [confirmMaster, setConfirmMaster] = useState('')
  const [understood, setUnderstood] = useState('')
  const [entries, setEntries] = useState<Summary[]>([])
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ id: string; password: string; notes: string } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showDraftPassword, setShowDraftPassword] = useState(false)
  const [generator, setGenerator] = useState<GeneratorOptions>(DEFAULT_GENERATOR)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const lastTouch = useRef(0)

  const forgetShown = useCallback((): void => {
    setEntries([])
    setSelectedId(null)
    setSecret(null)
    setDraft(null)
    setFilter('')
    setConfirmDelete(false)
    setMaster('')
    setConfirmMaster('')
  }, [])

  const fail = useCallback((code: string): void => {
    if (code === 'unlock-failed') setMode((m) => (m === 'unlocked' ? 'locked' : m))
    setError(MESSAGES[code] ?? 'Something went wrong. Try again.')
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.vault || !accountId) return
    const status = await window.vault.status(accountId)
    if (!status.ok) return fail(status.code)
    setMode(status.value)
    if (status.value !== 'unlocked') return
    const list = await window.vault.list()
    if (list.ok) setEntries(list.value)
  }, [accountId, fail])

  useEffect(() => {
    const show = (): void => {
      setOpen(true)
      setError(null)
      setMode('loading')
    }
    window.addEventListener(OPEN_VAULT, show)
    return () => window.removeEventListener(OPEN_VAULT, show)
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  useEffect(
    () =>
      window.vault?.onLocked(() => {
        forgetShown()
        setMode((m) => (m === 'unlocked' ? 'locked' : m))
      }),
    [forgetShown]
  )

  const close = useCallback((): void => {
    setOpen(false)
    forgetShown()
    setError(null)
    void window.vault?.lock()
  }, [forgetShown])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      // The notes behind the sheet must not react to shortcuts while it is open.
      if (e.key === 'Escape' || e.ctrlKey || e.metaKey) e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close])

  // Key presses already count as activity in the main process; pointer use is reported here, at most every 10 s.
  const onPointer = (): void => {
    if (mode !== 'unlocked' || Date.now() - lastTouch.current < 10_000) return
    lastTouch.current = Date.now()
    void window.vault?.touch()
  }

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const create = (e: FormEvent): Promise<void> =>
    run(async () => {
      e.preventDefault()
      if (!accountId || !window.vault) return
      if (master.length < MIN_MASTER) return fail('weak-password')
      if (master !== confirmMaster) return setError('The two passwords are different.')
      if (understood.trim().toLowerCase() !== UNDERSTOOD.toLowerCase()) return setError(`Type “${UNDERSTOOD}” to confirm.`)
      const r = await window.vault.create(accountId, master)
      setMaster('')
      setConfirmMaster('')
      if (!r.ok) return fail(r.code)
      setUnderstood('')
      await refresh()
    })

  const unlock = (e: FormEvent): Promise<void> =>
    run(async () => {
      e.preventDefault()
      if (!accountId || !window.vault) return
      const r = await window.vault.unlock(accountId, master)
      setMaster('')
      if (!r.ok) return fail(r.code)
      await refresh()
    })

  const lockNow = (): void => {
    forgetShown()
    setMode('locked')
    void window.vault?.lock()
  }

  const reveal = async (id: string): Promise<{ password: string; notes: string } | null> => {
    const r = await window.vault!.reveal(id)
    if (!r.ok) {
      fail(r.code)
      return null
    }
    return { password: r.value.password, notes: r.value.notes }
  }

  const toggleSecret = async (id: string): Promise<void> => {
    if (secret?.id === id) return setSecret(null)
    const shown = await reveal(id)
    if (shown) setSecret({ id, ...shown })
  }

  const copy = async (id: string): Promise<void> => {
    const r = await window.vault!.copy(id)
    if (!r.ok) return fail(r.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const startEdit = async (entry: Summary): Promise<void> => {
    const shown = await reveal(entry.id)
    if (!shown) return
    setSecret(null)
    setShowDraftPassword(false)
    setDraft({ id: entry.id, title: entry.title, username: entry.username, url: entry.url, ...shown })
  }

  const saveDraft = (e: FormEvent): Promise<void> =>
    run(async () => {
      e.preventDefault()
      if (!draft) return
      const r = await window.vault!.save(draft)
      if (!r.ok) return fail(r.code)
      setEntries(r.value)
      setSelectedId(draft.id ?? r.value.find((s) => !entries.some((e) => e.id === s.id))?.id ?? null)
      setDraft(null)
    })

  const remove = (id: string): Promise<void> =>
    run(async () => {
      const r = await window.vault!.remove(id)
      if (!r.ok) return fail(r.code)
      setEntries(r.value)
      setSelectedId(null)
      setSecret(null)
      setConfirmDelete(false)
    })

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? entries.filter((e) => [e.title, e.username, e.url].some((f) => f.toLowerCase().includes(q))) : entries
  }, [entries, filter])
  const selected = entries.find((e) => e.id === selectedId) ?? null

  const masterField = (value: string, set: (v: string) => void, placeholder: string, autoFocus = false): ReactNode => (
    <input
      type="password"
      className="vault-input"
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => set(e.target.value)}
    />
  )

  const body = (): ReactNode => {
    if (!window.vault) return <p className="vault-text">The Secure Vault is available in the desktop app.</p>
    if (mode === 'loading') return null
    if (mode === 'none')
      return (
        <form className="vault-form" onSubmit={create}>
          <div className="vault-warning" role="note">
            <strong>There is no way to recover a forgotten master password.</strong> Your vault is encrypted on this
            computer with it. If you forget it, nobody can open the vault, including the people who make Notes. The vault
            stays on this computer and is not synced or included in your notes.
          </div>
          {masterField(master, setMaster, `Master password (at least ${MIN_MASTER} characters)`, true)}
          {masterField(confirmMaster, setConfirmMaster, 'Type it again')}
          <label className="vault-label">
            Type “{UNDERSTOOD}” to confirm you have read the warning
            <input className="vault-input" value={understood} spellCheck={false} onChange={(e) => setUnderstood(e.target.value)} />
          </label>
          <button className="vault-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create Vault'}
          </button>
        </form>
      )
    if (mode === 'locked')
      return (
        <form className="vault-form" onSubmit={unlock}>
          <p className="vault-text">The vault is locked.</p>
          {masterField(master, setMaster, 'Master password', true)}
          <button className="vault-primary" disabled={busy || !master}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      )
    return (
      <div className="vault-body">
        <div className="vault-list">
          <label className="shortcut-filter">
            <Search size={14} />
            <input placeholder="Search the vault" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="vault-rows">
            {shown.map((e) => (
              <button
                key={e.id}
                className={`vault-row${e.id === selectedId ? ' selected' : ''}`}
                onClick={() => (setSelectedId(e.id), setSecret(null), setDraft(null), setConfirmDelete(false))}
              >
                <span className="vault-row-title">{e.title}</span>
                <span className="vault-row-sub">{e.username || host(e.url)}</span>
              </button>
            ))}
            {!entries.length ? <div className="shortcut-empty">No passwords yet.</div> : !shown.length ? <div className="shortcut-empty">Nothing matches “{filter}”.</div> : null}
          </div>
        </div>
        <div className="vault-detail">{draft ? editor(draft) : selected ? details(selected) : <p className="vault-text">Choose an entry, or add one.</p>}</div>
      </div>
    )
  }

  const details = (e: Summary): ReactNode => (
    <div className="vault-fields">
      <h3>{e.title}</h3>
      {e.username ? <Field label="Username" value={e.username} /> : null}
      <div className="vault-field">
        <span className="vault-field-label">Password</span>
        <span className="vault-secret">{secret?.id === e.id ? secret.password : '••••••••••'}</span>
        <button className="vault-icon" aria-label={secret?.id === e.id ? 'Hide password' : 'Show password'} onClick={() => void toggleSecret(e.id)}>
          {secret?.id === e.id ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button className="vault-icon" aria-label="Copy password" onClick={() => void copy(e.id)}>
          <Copy size={14} />
        </button>
      </div>
      {copied ? <div className="vault-hint">Copied. It is cleared from the clipboard in 30 seconds.</div> : null}
      {e.url ? (
        <div className="vault-field">
          <span className="vault-field-label">Website</span>
          <a href={e.url} target="_blank" rel="noreferrer">
            {host(e.url) || e.url}
          </a>
        </div>
      ) : null}
      {secret?.id === e.id && secret.notes ? <Field label="Notes" value={secret.notes} /> : null}
      <div className="vault-actions">
        <button className="pop-action" onClick={() => void startEdit(e)}>
          <Pencil size={13} /> Edit
        </button>
        {confirmDelete ? (
          <button className="pop-action danger" disabled={busy} onClick={() => void remove(e.id)}>
            <Trash2 size={13} /> Delete “{e.title}” for good
          </button>
        ) : (
          <button className="pop-action danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  )

  const editor = (d: Draft): ReactNode => {
    const set = (patch: Partial<Draft>): void => setDraft((cur) => cur && { ...cur, ...patch })
    return (
      <form className="vault-fields" onSubmit={saveDraft}>
        <h3>{d.id ? 'Edit Entry' : 'New Entry'}</h3>
        <input className="vault-input" placeholder="Title" value={d.title} autoFocus onChange={(e) => set({ title: e.target.value })} />
        <input className="vault-input" placeholder="Username or email" value={d.username} spellCheck={false} onChange={(e) => set({ username: e.target.value })} />
        <div className="vault-password-row">
          <input
            className="vault-input"
            type={showDraftPassword ? 'text' : 'password'}
            placeholder="Password"
            value={d.password}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => set({ password: e.target.value })}
          />
          <button type="button" className="vault-icon" aria-label={showDraftPassword ? 'Hide password' : 'Show password'} onClick={() => setShowDraftPassword((v) => !v)}>
            {showDraftPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button type="button" className="vault-icon" aria-label="Generate a password" onClick={() => (set({ password: generatePassword(generator) }), setShowDraftPassword(true))}>
            <Wand2 size={14} />
          </button>
        </div>
        <div className="vault-generator">
          <label>
            Length {generator.length}
            <input type="range" min={MIN_LENGTH} max={MAX_LENGTH} value={generator.length} onChange={(e) => setGenerator((g) => ({ ...g, length: Number(e.target.value) }))} />
          </label>
          {(['lower', 'upper', 'digits', 'symbols'] as const).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={generator[k]} onChange={(e) => setGenerator((g) => ({ ...g, [k]: e.target.checked }))} />
              {{ lower: 'a–z', upper: 'A–Z', digits: '0–9', symbols: '!#$' }[k]}
            </label>
          ))}
        </div>
        <input className="vault-input" placeholder="Website (https://…)" value={d.url} spellCheck={false} onChange={(e) => set({ url: e.target.value })} />
        <textarea className="vault-input" placeholder="Notes" rows={3} value={d.notes} spellCheck={false} onChange={(e) => set({ notes: e.target.value })} />
        <div className="vault-actions">
          <button className="vault-primary" disabled={busy || !d.title.trim()}>
            Save
          </button>
          <button type="button" className="pop-action" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            className="sheet vault-sheet"
            role="dialog"
            aria-label="Secure Vault"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={onPointer}
          >
            <div className="sheet-head">
              <h2>Secure Vault</h2>
              {mode === 'unlocked' ? (
                <>
                  <button className="pop-action" onClick={() => (setDraft({ ...EMPTY_DRAFT }), setSelectedId(null), setSecret(null), setShowDraftPassword(false))}>
                    <Plus size={13} /> Add
                  </button>
                  <button className="pop-action" onClick={lockNow}>
                    <Lock size={13} /> Lock
                  </button>
                </>
              ) : null}
              <button className="sheet-close" aria-label="Close" onClick={close}>
                <X size={16} />
              </button>
            </div>
            {error ? (
              <div className="shortcut-error vault-error" role="alert">
                {error}
              </div>
            ) : null}
            {body()}
            <div className="sheet-foot">
              <span className="sheet-hint">Encrypted on this computer. Locks after 5 minutes without use, and when you close it.</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

function Field({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="vault-field">
      <span className="vault-field-label">{label}</span>
      <span className="vault-value">{value}</span>
    </div>
  )
}
