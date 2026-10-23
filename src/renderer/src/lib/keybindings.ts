import { extensions as coreExtensions, flattenExtensions, getExtensionField, type AnyExtension } from '@tiptap/core'
import { buildExtensions } from '../editor/extensions'
import {
  comboId,
  currentOverrides,
  keysFor,
  parseKeys,
  physicalKey,
  setOverrides,
  SHORTCUTS,
  type KeyEventLike,
  type Overrides,
  type Platform,
  type ShortcutId,
  type ShortcutScope
} from './shortcuts'

// Keys the macOS menu (roles in src/main/index.ts) or the system takes first, plus standard Mac window keys.
export const MAC_RESERVED = [
  'Mod-q', 'Mod-h', 'Alt-Mod-h', 'Mod-m', 'Mod-w', 'Mod-z', 'Shift-Mod-z', 'Mod-x', 'Mod-c', 'Mod-v',
  'Alt-Shift-Mod-v', 'Mod-a', 'Mod-r', 'Alt-Mod-i', 'Ctrl-Mod-f', 'Ctrl-Mod-Space', 'Mod-Space', 'Mod-Tab', 'Mod-`'
]
// Clipboard, select all and undo/redo, which a shortcut must never take over.
const WIN_RESERVED = ['Mod-c', 'Mod-x', 'Mod-v', 'Mod-a', 'Mod-z', 'Mod-Shift-z', 'Mod-y', 'Alt-F4']

export const reservedKeys = (platform: Platform): readonly string[] => (platform === 'mac' ? MAC_RESERVED : WIN_RESERVED)

export type Entry = { id: string; scope: ShortcutScope; keys: readonly string[]; replacesBuiltIn?: boolean; shadows?: string }

export type Conflict =
  | { kind: 'clash'; id: string; with: string; key: string }
  | { kind: 'reserved'; id: string; key: string }
  | { kind: 'unreachable'; id: string; builtIn: string }
  | { kind: 'undeclared'; id: string; builtIn: string }
  | { kind: 'stale'; id: string }

/** The registry as the conflict check sees it. A changed entry no longer replaces a TipTap key on purpose. */
export const registryEntries = (platform: Platform, overrides: Overrides = {}): Entry[] =>
  (Object.keys(SHORTCUTS) as ShortcutId[]).map((id) => {
    const s: { scope: ShortcutScope; replacesBuiltIn?: boolean; shadows?: string } = SHORTCUTS[id]
    const replacesBuiltIn = overrides[id] ? undefined : s.replacesBuiltIn
    return { id, scope: s.scope, keys: keysFor(id, platform, overrides), replacesBuiltIn, shadows: s.shadows }
  })

/** Shortcuts TipTap binds itself, read from the extensions the editor actually loads. TipTap reads the platform from navigator. */
export function builtInKeys(platform: Platform): Map<string, string> {
  const found = new Map<string, string>()
  const core = (Object.values(coreExtensions) as unknown[]).filter((v): v is AnyExtension => typeof v === 'object' && v !== null && 'config' in v)
  for (const ext of flattenExtensions([...core, ...buildExtensions()])) {
    const add = getExtensionField<(() => Record<string, unknown>) | undefined>(ext, 'addKeyboardShortcuts', {
      name: ext.name,
      options: ext.options,
      storage: ext.storage,
      editor: {} as never,
      type: null as never
    })
    for (const keys of Object.keys(add?.() ?? {})) found.set(comboId(keys, platform), ext.name)
  }
  return found
}

export function findConflicts(entries: Entry[], platform: Platform, builtIns: Map<string, string>, reserved: readonly string[]): Conflict[] {
  const found: Conflict[] = []
  const owners = new Map<string, Entry>()
  const taken = new Set(reserved.map((k) => comboId(k, platform)))
  for (const e of entries) {
    const replaced = e.keys.map((k) => builtIns.get(comboId(k, platform))).filter((n): n is string => !!n)
    for (const keys of e.keys) {
      const key = comboId(keys, platform)
      const owner = owners.get(key)
      const declared = owner && (owner.id === e.id || e.shadows === owner.id || owner.shadows === e.id)
      if (owner && !declared) found.push({ kind: 'clash', id: e.id, with: owner.id, key })
      owners.set(key, e)
      if (taken.has(key)) found.push({ kind: 'reserved', id: e.id, key })
    }
    // The editor sees a key before the app, so an app shortcut on a TipTap key never fires while typing.
    if (e.scope === 'app' && replaced.length) found.push({ kind: 'unreachable', id: e.id, builtIn: replaced[0] })
    if (e.scope === 'editor' || e.scope === 'selection') {
      if (replaced.length && !e.replacesBuiltIn) found.push({ kind: 'undeclared', id: e.id, builtIn: replaced[0] })
      if (!replaced.length && e.replacesBuiltIn) found.push({ kind: 'stale', id: e.id })
    }
  }
  return found
}

const NAVIGATION = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

/**
 * Keys that would type text or move the cursor. Option on a Mac types characters (⌥E is é), so it only counts as a
 * modifier with a non-printing key; Alt on Windows types nothing.
 */
export function typesText(keys: string, platform: Platform): boolean {
  const c = parseKeys(keys, platform)
  if (c.ctrl || c.meta || /^F\d{1,2}$/.test(c.key)) return false
  const printable = c.key.length === 1 || c.key === 'Space'
  if (c.alt) return printable ? platform === 'mac' : !NAVIGATION.has(c.key)
  return true
}

export type Problem = { kind: 'typing' } | { kind: 'reserved' } | { kind: 'clash'; with: ShortcutId } | { kind: 'editor'; builtIn: string }

let builtInCache: { platform: Platform; keys: Map<string, string> } | null = null
const builtInsFor = (platform: Platform): Map<string, string> => {
  if (builtInCache?.platform !== platform) builtInCache = { platform, keys: builtInKeys(platform) }
  return builtInCache.keys
}

/** Why `keys` cannot be given to `id`, or null when it can. */
export function checkKeys(id: ShortcutId, keys: readonly string[], platform: Platform, overrides: Overrides, builtIns = builtInsFor(platform)): Problem | null {
  if (keys.some((k) => typesText(k, platform))) return { kind: 'typing' }
  const conflicts = findConflicts(registryEntries(platform, { ...overrides, [id]: keys }), platform, builtIns, reservedKeys(platform))
  for (const c of conflicts) {
    if (c.kind === 'clash' && (c.id === id || c.with === id)) return { kind: 'clash', with: (c.id === id ? c.with : c.id) as ShortcutId }
    if (c.id !== id) continue
    if (c.kind === 'reserved') return { kind: 'reserved' }
    if (c.kind === 'undeclared' || c.kind === 'unreachable') return { kind: 'editor', builtIn: c.builtIn }
  }
  return null
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn'])

/** The key string for a key press in Keyboard Shortcuts, read from the physical key so any keyboard layout records the same thing. */
export function recordKeys(e: KeyEventLike, platform: Platform): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const fromCode = physicalKey(e.code)
  const key = fromCode.length === 1 ? fromCode : e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key
  const mods = platform === 'mac' ? [e.metaKey && 'Mod', e.ctrlKey && 'Ctrl'] : [e.ctrlKey && 'Mod', e.metaKey && 'Meta']
  return [...mods, e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('-')
}

const STORAGE_KEY = 'win-notes:shortcuts'

/** Saved keys that still make sense: known, changeable, well-formed and not typing keys. Anything else is dropped. */
export function validOverrides(raw: unknown, platform: Platform): Overrides {
  const valid: Overrides = {}
  if (!raw || typeof raw !== 'object') return valid
  for (const [id, keys] of Object.entries(raw as Record<string, unknown>)) {
    if (!(id in SHORTCUTS) || (SHORTCUTS[id as ShortcutId] as { fixed?: true }).fixed) continue
    if (!Array.isArray(keys) || !keys.length || !keys.every((k) => typeof k === 'string')) continue
    try {
      if (keys.some((k) => typesText(k, platform))) continue
    } catch {
      continue
    }
    valid[id as ShortcutId] = keys
  }
  return valid
}

export function loadKeybindings(platform: Platform): void {
  try {
    setOverrides(validOverrides(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'), platform))
  } catch {
    setOverrides({})
  }
}

function save(next: Overrides): void {
  setOverrides(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable; the change still applies until the app closes.
  }
}

/** Gives `id` new keys, or its defaults back when `keys` is null. Callers check the keys with checkKeys first. */
export function saveKeys(id: ShortcutId, keys: readonly string[] | null): void {
  const next = { ...currentOverrides() }
  if (keys) next[id] = keys
  else delete next[id]
  save(next)
}

export const resetAllKeys = (): void => save({})
