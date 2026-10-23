// Every keyboard shortcut in the app. Keys use ProseMirror's notation; "Mod" is Cmd on Mac and Ctrl elsewhere.
// shortcuts.test.ts fails when two entries collide or an entry takes a key TipTap or the macOS menu already uses.

export type Platform = 'mac' | 'win'
type Keys = readonly string[] | { readonly mac: readonly string[]; readonly win: readonly string[] }
// app: anywhere in the window. editor: ProseMirror keymap inside a note. search: while the search box has focus.
// selection: read from the key event inside a note before the keymap; `shadows` names the app shortcut it takes over
// there, which is the only overlap the conflict test allows.
export type ShortcutScope = 'app' | 'editor' | 'search' | 'selection'
type Shortcut = { readonly scope: ShortcutScope; readonly keys: Keys; readonly replacesBuiltIn?: true; readonly shadows?: string }

export const SHORTCUTS = {
  newNote: { scope: 'app', keys: ['Mod-n'] },
  newFolder: { scope: 'app', keys: ['Mod-Shift-n'] },
  // Option-Cmd-F is "search all notes" in macOS Notes; here both open the same search.
  search: { scope: 'app', keys: ['Mod-f', 'Mod-Alt-f'] },
  listLayout: { scope: 'app', keys: ['Mod-1'] },
  galleryLayout: { scope: 'app', keys: ['Mod-2'] },
  duplicateNote: { scope: 'app', keys: ['Mod-d'] },
  toggleSidebar: { scope: 'app', keys: { mac: ['Ctrl-Mod-s'], win: ['Ctrl-Alt-s'] } },
  closeGallery: { scope: 'app', keys: ['Escape'] },
  // + needs Shift on US keyboards but not on German ones or the numpad, and Cmd+Shift can report the unshifted key.
  zoomIn: { scope: 'app', keys: ['Mod-=', 'Mod-+', 'Mod-Shift-=', 'Mod-Shift-+'] },
  zoomOut: { scope: 'app', keys: ['Mod--'] },
  resetZoom: { scope: 'app', keys: ['Mod-0'] },

  // VS Code's find-widget toggles.
  matchCase: { scope: 'search', keys: { mac: ['Alt-Mod-c'], win: ['Alt-c'] } },
  matchWholeWord: { scope: 'search', keys: { mac: ['Alt-Mod-w'], win: ['Alt-w'] } },
  useRegex: { scope: 'search', keys: { mac: ['Alt-Mod-r'], win: ['Alt-r'] } },

  // VS Code's multi-cursor keys. Its Select All Occurrences key (Mod-Shift-l) is Checklist here, so this uses Mod-F2.
  selectNextMatch: { scope: 'selection', keys: ['Mod-d'], shadows: 'duplicateNote' },
  selectAllMatches: { scope: 'selection', keys: ['Mod-F2'] },
  clearMultiSelection: { scope: 'selection', keys: ['Escape'], shadows: 'closeGallery' },

  styleTitle: { scope: 'editor', keys: ['Mod-Shift-t'] },
  styleHeading: { scope: 'editor', keys: ['Mod-Shift-h'], replacesBuiltIn: true },
  styleSubheading: { scope: 'editor', keys: ['Mod-Shift-j'] },
  styleBody: { scope: 'editor', keys: ['Mod-Shift-b'], replacesBuiltIn: true },
  styleMono: { scope: 'editor', keys: ['Mod-Shift-m'] },
  bulletList: { scope: 'editor', keys: ['Mod-Shift-7'], replacesBuiltIn: true },
  dashedList: { scope: 'editor', keys: ['Mod-Shift-8'], replacesBuiltIn: true },
  numberedList: { scope: 'editor', keys: ['Mod-Shift-9'], replacesBuiltIn: true },
  checklist: { scope: 'editor', keys: ['Mod-Shift-l'] },
  toggleChecked: { scope: 'editor', keys: ['Mod-Shift-u'], replacesBuiltIn: true },
  blockQuote: { scope: 'editor', keys: ["Mod-'"] },
  divider: { scope: 'editor', keys: ['Mod-l'] },
  insertTable: { scope: 'editor', keys: ['Mod-Alt-t'] },
  indent: { scope: 'editor', keys: ['Mod-]'] },
  outdent: { scope: 'editor', keys: ['Mod-['] },
  addRowBefore: { scope: 'editor', keys: ['Mod-Alt-ArrowUp'] },
  addRowAfter: { scope: 'editor', keys: ['Mod-Alt-ArrowDown'] },
  addColumnBefore: { scope: 'editor', keys: ['Mod-Alt-ArrowLeft'] },
  addColumnAfter: { scope: 'editor', keys: ['Mod-Alt-ArrowRight'] },
  // macOS text alignment keys. Each Shift+bracket is bound in both forms: Windows can report Ctrl+Shift+[ as "[",
  // and ProseMirror then retries without Shift, which would reach Outdent.
  alignLeft: { scope: 'editor', keys: ['Mod-{', 'Mod-Shift-['] },
  alignCenter: { scope: 'editor', keys: ['Mod-|', 'Mod-Shift-\\'] },
  alignRight: { scope: 'editor', keys: ['Mod-}', 'Mod-Shift-]'] }
} as const satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof SHORTCUTS
type ScopedId<S extends Shortcut['scope']> = { [K in ShortcutId]: (typeof SHORTCUTS)[K]['scope'] extends S ? K : never }[ShortcutId]
export type AppShortcutId = ScopedId<'app'>
export type EditorShortcutId = ScopedId<'editor'>
export type SearchShortcutId = ScopedId<'search'>

export type KeyCombo = { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

export function parseKeys(keys: string, platform: Platform): KeyCombo {
  const parts = keys.split(/-(?!$)/)
  let key = parts.pop()!
  const combo = { key, ctrl: false, alt: false, shift: false, meta: false }
  for (const mod of parts) {
    if (mod === 'Mod') combo[platform === 'mac' ? 'meta' : 'ctrl'] = true
    else if (mod === 'Ctrl') combo.ctrl = true
    else if (mod === 'Alt') combo.alt = true
    else if (mod === 'Shift') combo.shift = true
    else if (mod === 'Meta') combo.meta = true
    else throw new Error(`Unknown modifier "${mod}" in "${keys}"`)
  }
  // An upper-case letter only fires with Shift or Caps Lock held, so it counts as Shift plus the letter.
  if (/^[A-Z]$/.test(key)) {
    key = key.toLowerCase()
    combo.shift = true
  }
  return { ...combo, key }
}

const KEY_LABELS: Record<string, { mac: string; win: string }> = {
  ArrowUp: { mac: '↑', win: 'Up' },
  ArrowDown: { mac: '↓', win: 'Down' },
  ArrowLeft: { mac: '←', win: 'Left' },
  ArrowRight: { mac: '→', win: 'Right' },
  Escape: { mac: 'Esc', win: 'Esc' }
}

function label(c: KeyCombo, platform: Platform): string {
  const key = KEY_LABELS[c.key]?.[platform] ?? c.key.toUpperCase()
  if (platform === 'mac') return `${c.ctrl ? '⌃' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${c.meta ? '⌘' : ''}${key}`
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', key].filter(Boolean).join('+')
}

const physicalKey = (code: string): string =>
  code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code

function matches(e: KeyEventLike, c: KeyCombo, platform: Platform): boolean {
  if (e.ctrlKey !== c.ctrl || e.altKey !== c.alt || e.shiftKey !== c.shift || e.metaKey !== c.meta) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === c.key) return true
  // Non-Latin layouts and Option-modified letters fall back to the physical key, as ProseMirror's keymap does.
  // Ctrl+Alt on Windows is AltGr typing a real character, so it never falls back.
  if (/^[a-z0-9]$/.test(key) || (platform === 'win' && e.ctrlKey && e.altKey)) return false
  return physicalKey(e.code) === c.key
}

export function keysFor(id: ShortcutId, platform: Platform): readonly string[] {
  const keys: Keys = SHORTCUTS[id].keys
  return 'mac' in keys ? keys[platform] : keys
}

export function shortcutsFor(platform: Platform) {
  return {
    label: (id: ShortcutId): string => label(parseKeys(keysFor(id, platform)[0], platform), platform),
    /** For shortcuts read straight from key events; editor ones go through `keymap`. */
    matches: (e: KeyEventLike, id: Exclude<ShortcutId, EditorShortcutId>): boolean =>
      keysFor(id, platform).some((k) => matches(e, parseKeys(k, platform), platform)),
    /** ProseMirror keymap for the editor shortcuts; every one must have a handler. */
    keymap: (handlers: Record<EditorShortcutId, () => boolean>): Record<string, () => boolean> =>
      Object.fromEntries(
        (Object.keys(handlers) as EditorShortcutId[]).flatMap((id) => keysFor(id, platform).map((k) => [k, handlers[id]]))
      )
  }
}

// The Android editor runs outside Electron, has no appInfo, and uses Ctrl like Windows.
const isMac = typeof window !== 'undefined' && window.appInfo?.platform === 'darwin'
export const shortcuts = shortcutsFor(isMac ? 'mac' : 'win')
