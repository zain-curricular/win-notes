import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw, Search, X } from 'lucide-react'
import { builtInKeys, checkKeys, findConflicts, recordKeys, registryEntries, reservedKeys, resetAllKeys, saveKeys, type Problem } from '../lib/keybindings'
import {
  comboId,
  currentOverrides,
  keyLabel,
  keysFor,
  onShortcutsChange,
  platform,
  SHORTCUTS,
  shortcutsVersion,
  type ShortcutId
} from '../lib/shortcuts'

export const OPEN_SHORTCUTS = 'notes:open-shortcuts'

const mod = platform === 'mac' ? '⌘' : 'Ctrl'
// Linux uses the Windows key rules, but the message should name the system the person is on.
const system = platform === 'mac' ? 'macOS' : window.appInfo?.platform === 'linux' ? 'Linux' : 'Windows'

function explain(problem: Problem, keys: string): string {
  const key = keyLabel(keys, platform)
  switch (problem.kind) {
    case 'clash':
      return `${key} is already used by ${SHORTCUTS[problem.with].title}.`
    case 'editor':
      return `${key} is used by the editor (${problem.builtIn}).`
    case 'reserved':
      return `${key} belongs to ${system} or to copy, paste and undo.`
    case 'typing':
      return `${key} would type or move the cursor. Hold ${mod}${platform === 'win' ? ' or Alt' : ''} with it.`
  }
}

// One chip per physical key press: Mod-{ and Mod-Shift-[ are the same keys held down.
const distinctLabels = (keys: readonly string[]): string[] => {
  const seen = new Set<string>()
  return keys.filter((k) => !seen.has(comboId(k, platform)) && seen.add(comboId(k, platform))).map((k) => keyLabel(k, platform))
}

export function ShortcutSettings(): ReactNode {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [error, setError] = useState<{ id: ShortcutId; text: string } | null>(null)
  useSyncExternalStore(onShortcutsChange, shortcutsVersion)
  const overrides = currentOverrides()

  useEffect(() => {
    const show = (): void => setOpen(true)
    window.addEventListener(OPEN_SHORTCUTS, show)
    return () => window.removeEventListener(OPEN_SHORTCUTS, show)
  }, [])

  const builtIns = useMemo(() => (open ? builtInKeys(platform) : new Map<string, string>()), [open])
  // Saved keys can clash with a default added by a later version; those rows are flagged.
  const clashing = useMemo(() => {
    const ids = new Set<string>()
    for (const c of findConflicts(registryEntries(platform, overrides), platform, builtIns, reservedKeys(platform))) {
      ids.add(c.id)
      if (c.kind === 'clash') ids.add(c.with)
    }
    return ids
  }, [overrides, builtIns])

  useEffect(() => {
    if (!open) return
    // Capture phase, so neither the app's shortcuts nor the note see the keys being recorded.
    const onKey = (e: KeyboardEvent): void => {
      if (!recording) {
        if (e.key === 'Escape') setOpen(false)
        // The notes behind the window must not react to shortcuts while it is open; editing the filter still works.
        if (e.key === 'Escape' || e.ctrlKey || e.metaKey) e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setRecording(null)
        setError(null)
        return
      }
      const keys = recordKeys(e, platform)
      if (!keys) return
      const problem = checkKeys(recording, [keys], platform, currentOverrides(), builtIns)
      if (problem) return setError({ id: recording, text: explain(problem, keys) })
      saveKeys(recording, [keys])
      setRecording(null)
      setError(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, recording, builtIns])

  const close = (): void => {
    setOpen(false)
    setRecording(null)
    setError(null)
  }

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const byGroup = new Map<string, ShortcutId[]>()
    for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
      const s = SHORTCUTS[id]
      const labels = distinctLabels(keysFor(id, platform, overrides)).join(' ').toLowerCase()
      if (q && !s.title.toLowerCase().includes(q) && !s.group.toLowerCase().includes(q) && !labels.includes(q)) continue
      byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), id])
    }
    return [...byGroup]
  }, [filter, overrides])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            className="sheet shortcut-sheet"
            role="dialog"
            aria-label="Keyboard Shortcuts"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>Keyboard Shortcuts</h2>
              <button className="sheet-close" aria-label="Close" onClick={close}>
                <X size={16} />
              </button>
            </div>
            <label className="shortcut-filter">
              <Search size={14} />
              <input autoFocus placeholder="Search shortcuts" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
            <div className="shortcut-list">
              {groups.map(([group, ids]) => (
                <section key={group}>
                  <h3>{group}</h3>
                  {ids.map((id) => {
                    const s: { title: string; fixed?: true } = SHORTCUTS[id]
                    const custom = !!overrides[id]
                    const isRecording = recording === id
                    return (
                      <div key={id} className={`shortcut-row${isRecording ? ' recording' : ''}${clashing.has(id) ? ' clashing' : ''}`}>
                        <span className="shortcut-title">
                          {s.title}
                          {custom ? <span className="shortcut-badge">Changed</span> : null}
                        </span>
                        <span className="shortcut-keys">
                          {isRecording ? (
                            <span className="shortcut-prompt">Press the new keys… (Esc to cancel)</span>
                          ) : keysFor(id, platform, overrides).length ? (
                            distinctLabels(keysFor(id, platform, overrides)).map((l) => <kbd key={l}>{l}</kbd>)
                          ) : (
                            <span className="shortcut-unset">Not set</span>
                          )}
                        </span>
                        <span className="shortcut-actions">
                          {s.fixed ? (
                            <span className="shortcut-fixed">Fixed</span>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setError(null)
                                  setRecording(isRecording ? null : id)
                                }}
                              >
                                {isRecording ? 'Cancel' : 'Change'}
                              </button>
                              {custom ? (
                                <button aria-label={`Reset ${s.title}`} title="Back to the default" onClick={() => saveKeys(id, null)}>
                                  <RotateCcw size={13} />
                                </button>
                              ) : null}
                            </>
                          )}
                        </span>
                        {error?.id === id ? <div className="shortcut-error">{error.text}</div> : null}
                        {clashing.has(id) && error?.id !== id ? <div className="shortcut-error">This key is also used by another action. Change one of them.</div> : null}
                      </div>
                    )
                  })}
                </section>
              ))}
              {groups.length === 0 ? <div className="shortcut-empty">No shortcuts match “{filter}”.</div> : null}
            </div>
            <div className="sheet-foot">
              <span className="sheet-hint">Saved on this computer.</span>
              <button className="pop-action" disabled={!Object.keys(overrides).length} onClick={resetAllKeys}>
                <RotateCcw size={13} /> Reset All
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
