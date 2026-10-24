// Every keyboard shortcut in the app. Keys use ProseMirror's notation; "Mod" is Cmd on Mac and Ctrl elsewhere.
// keybindings.ts refuses a key that collides with another entry, TipTap or the macOS menu; shortcuts.test.ts holds the
// defaults to the same check.

export type Platform = 'mac' | 'win'
type Keys = readonly string[] | { readonly mac: readonly string[]; readonly win: readonly string[] }
// app: anywhere in the window. editor: ProseMirror keymap inside a note. search: while the search box has focus.
// selection: read from the key event inside a note before the keymap; `shadows` names the app shortcut it takes over
// there, which is the only overlap the conflict test allows.
export type ShortcutScope = 'app' | 'editor' | 'search' | 'selection'
// fixed: Esc keys stay as they are, so a note or selection can always be left.
type Shortcut = {
  readonly title: string
  readonly group: string
  readonly scope: ShortcutScope
  readonly keys: Keys
  readonly replacesBuiltIn?: true
  readonly shadows?: string
  readonly fixed?: true
}

export const SHORTCUTS = {
  newNote: { title: 'New Note', group: 'Notes', scope: 'app', keys: ['Mod-n'] },
  newFolder: { title: 'New Folder', group: 'Notes', scope: 'app', keys: ['Mod-Shift-n'] },
  // Option-Cmd-F is "search all notes" in macOS Notes; here both open the same search.
  search: { title: 'Search', group: 'Notes', scope: 'app', keys: ['Mod-f', 'Mod-Alt-f'] },
  listLayout: { title: 'View as List', group: 'View', scope: 'app', keys: ['Mod-1'] },
  galleryLayout: { title: 'View as Gallery', group: 'View', scope: 'app', keys: ['Mod-2'] },
  duplicateNote: { title: 'Duplicate Note', group: 'Notes', scope: 'app', keys: ['Mod-d'] },
  toggleSidebar: { title: 'Show or Hide Sidebar', group: 'View', scope: 'app', keys: { mac: ['Ctrl-Mod-s'], win: ['Ctrl-Alt-s'] } },
  closeGallery: { title: 'Close Note in Gallery', group: 'View', scope: 'app', keys: ['Escape'], fixed: true },
  // + needs Shift on US keyboards but not on German ones or the numpad, and Cmd+Shift can report the unshifted key.
  zoomIn: { title: 'Zoom In', group: 'View', scope: 'app', keys: ['Mod-=', 'Mod-+', 'Mod-Shift-=', 'Mod-Shift-+'] },
  zoomOut: { title: 'Zoom Out', group: 'View', scope: 'app', keys: ['Mod--'] },
  resetZoom: { title: 'Actual Size', group: 'View', scope: 'app', keys: ['Mod-0'] },
  // VS Code's Settings key.
  openShortcuts: { title: 'Keyboard Shortcuts', group: 'Notes', scope: 'app', keys: ['Mod-,'] },

  // VS Code's find-widget toggles.
  matchCase: { title: 'Match Case', group: 'Search box', scope: 'search', keys: { mac: ['Alt-Mod-c'], win: ['Alt-c'] } },
  matchWholeWord: { title: 'Match Whole Word', group: 'Search box', scope: 'search', keys: { mac: ['Alt-Mod-w'], win: ['Alt-w'] } },
  useRegex: { title: 'Use Regular Expression', group: 'Search box', scope: 'search', keys: { mac: ['Alt-Mod-r'], win: ['Alt-r'] } },

  // VS Code's multi-cursor keys. Its Select All Occurrences key (Mod-Shift-l) is Checklist here, so this uses Mod-F2.
  selectNextMatch: { title: 'Select Next Copy', group: 'Selection', scope: 'selection', keys: ['Mod-d'], shadows: 'duplicateNote' },
  selectAllMatches: { title: 'Select All Copies', group: 'Selection', scope: 'selection', keys: ['Mod-F2'] },
  clearMultiSelection: { title: 'Back to One Cursor', group: 'Selection', scope: 'selection', keys: ['Escape'], shadows: 'closeGallery', fixed: true },

  styleTitle: { title: 'Title', group: 'Text styles', scope: 'editor', keys: ['Mod-Shift-t'] },
  styleHeading: { title: 'Heading', group: 'Text styles', scope: 'editor', keys: ['Mod-Shift-h'], replacesBuiltIn: true },
  styleSubheading: { title: 'Subheading', group: 'Text styles', scope: 'editor', keys: ['Mod-Shift-j'] },
  styleBody: { title: 'Body', group: 'Text styles', scope: 'editor', keys: ['Mod-Shift-b'], replacesBuiltIn: true },
  styleMono: { title: 'Monostyled', group: 'Text styles', scope: 'editor', keys: ['Mod-Shift-m'] },
  bulletList: { title: 'Bulleted List', group: 'Lists', scope: 'editor', keys: ['Mod-Shift-7'], replacesBuiltIn: true },
  dashedList: { title: 'Dashed List', group: 'Lists', scope: 'editor', keys: ['Mod-Shift-8'], replacesBuiltIn: true },
  numberedList: { title: 'Numbered List', group: 'Lists', scope: 'editor', keys: ['Mod-Shift-9'], replacesBuiltIn: true },
  checklist: { title: 'Checklist', group: 'Lists', scope: 'editor', keys: ['Mod-Shift-l'] },
  toggleChecked: { title: 'Tick Checklist Item', group: 'Lists', scope: 'editor', keys: ['Mod-Shift-u'], replacesBuiltIn: true },
  blockQuote: { title: 'Block Quote', group: 'Insert', scope: 'editor', keys: ["Mod-'"] },
  divider: { title: 'Divider', group: 'Insert', scope: 'editor', keys: ['Mod-l'] },
  insertTable: { title: 'Table', group: 'Insert', scope: 'editor', keys: ['Mod-Alt-t'] },
  indent: { title: 'Indent', group: 'Lists', scope: 'editor', keys: ['Mod-]'] },
  outdent: { title: 'Outdent', group: 'Lists', scope: 'editor', keys: ['Mod-['] },
  addRowBefore: { title: 'Add Row Above', group: 'Tables', scope: 'editor', keys: ['Mod-Alt-ArrowUp'] },
  addRowAfter: { title: 'Add Row Below', group: 'Tables', scope: 'editor', keys: ['Mod-Alt-ArrowDown'] },
  addColumnBefore: { title: 'Add Column Before', group: 'Tables', scope: 'editor', keys: ['Mod-Alt-ArrowLeft'] },
  addColumnAfter: { title: 'Add Column After', group: 'Tables', scope: 'editor', keys: ['Mod-Alt-ArrowRight'] },
  // macOS text alignment keys. Each Shift+bracket is bound in both forms: Windows can report Ctrl+Shift+[ as "[",
  // and ProseMirror then retries without Shift, which would reach Outdent.
  alignLeft: { title: 'Align Left', group: 'Alignment', scope: 'editor', keys: ['Mod-{', 'Mod-Shift-['] },
  alignCenter: { title: 'Align Center', group: 'Alignment', scope: 'editor', keys: ['Mod-|', 'Mod-Shift-\\'] },
  alignRight: { title: 'Align Right', group: 'Alignment', scope: 'editor', keys: ['Mod-}', 'Mod-Shift-]'] },
  // VS Code's Copy Line Down/Up on both platforms; on a Mac this takes over Option-Shift-arrow paragraph selection.
  copyLineDown: { title: 'Copy Line Down', group: 'Lines', scope: 'editor', keys: ['Alt-Shift-ArrowDown'] },
  copyLineUp: { title: 'Copy Line Up', group: 'Lines', scope: 'editor', keys: ['Alt-Shift-ArrowUp'] },

  // Unbound, as in VS Code; keys can be given to them in Keyboard Shortcuts.
  caseUpper: { title: 'UPPERCASE', group: 'Change Case', scope: 'editor', keys: [] },
  caseLower: { title: 'lowercase', group: 'Change Case', scope: 'editor', keys: [] },
  caseTitle: { title: 'Title Case', group: 'Change Case', scope: 'editor', keys: [] },
  caseSentence: { title: 'Sentence case', group: 'Change Case', scope: 'editor', keys: [] },
  caseCamel: { title: 'camelCase', group: 'Change Case', scope: 'editor', keys: [] },
  casePascal: { title: 'PascalCase', group: 'Change Case', scope: 'editor', keys: [] },
  caseSnake: { title: 'snake_case', group: 'Change Case', scope: 'editor', keys: [] },
  caseScreamingSnake: { title: 'SCREAMING_SNAKE_CASE', group: 'Change Case', scope: 'editor', keys: [] },
  caseKebab: { title: 'kebab-case', group: 'Change Case', scope: 'editor', keys: [] },
  caseScreamingKebab: { title: 'SCREAMING-KEBAB-CASE', group: 'Change Case', scope: 'editor', keys: [] },
  caseDot: { title: 'dot.case', group: 'Change Case', scope: 'editor', keys: [] },
  casePath: { title: 'path/case', group: 'Change Case', scope: 'editor', keys: [] },
  caseToggle: { title: 'Toggle Case', group: 'Change Case', scope: 'editor', keys: [] }
} as const satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof SHORTCUTS
type ScopedId<S extends Shortcut['scope']> = { [K in ShortcutId]: (typeof SHORTCUTS)[K]['scope'] extends S ? K : never }[ShortcutId]
export type AppShortcutId = ScopedId<'app'>
export type EditorShortcutId = ScopedId<'editor'>
export type SearchShortcutId = ScopedId<'search'>

/** Keys a person picked in Keyboard Shortcuts, replacing an entry's defaults. */
export type Overrides = Partial<Record<ShortcutId, readonly string[]>>

export type KeyCombo = { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
export type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

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

// Shifted punctuation and the key it sits on, on the US layout that ProseMirror's keymap falls back to.
const SHIFTED: Record<string, string> = {
  '{': '[', '}': ']', '|': '\\', '+': '=', _: '-', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
  '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
}
const PUNCTUATION_CODES: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
  Period: '.', Slash: '/', Backquote: '`'
}

/** One name per physical key press, so Mod-{ and Mod-Shift-[ count as the same key. */
export function comboId(keys: string, platform: Platform): string {
  const c = parseKeys(keys, platform)
  const base = SHIFTED[c.key]
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', (c.shift || !!base) && 'Shift', c.meta && 'Meta', base ?? c.key].filter(Boolean).join('-')
}

const KEY_LABELS: Record<string, { mac: string; win: string }> = {
  ArrowUp: { mac: '↑', win: 'Up' },
  ArrowDown: { mac: '↓', win: 'Down' },
  ArrowLeft: { mac: '←', win: 'Left' },
  ArrowRight: { mac: '→', win: 'Right' },
  Escape: { mac: 'Esc', win: 'Esc' },
  Space: { mac: 'Space', win: 'Space' },
  Enter: { mac: '↩', win: 'Enter' },
  Backspace: { mac: '⌫', win: 'Backspace' },
  Delete: { mac: '⌦', win: 'Delete' },
  Tab: { mac: '⇥', win: 'Tab' }
}

function label(c: KeyCombo, platform: Platform): string {
  const key = KEY_LABELS[c.key]?.[platform] ?? c.key.toUpperCase()
  if (platform === 'mac') return `${c.ctrl ? '⌃' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${c.meta ? '⌘' : ''}${key}`
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', key].filter(Boolean).join('+')
}

export const physicalKey = (code: string): string =>
  code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : (PUNCTUATION_CODES[code] ?? code)

function matches(e: KeyEventLike, c: KeyCombo, platform: Platform): boolean {
  if (e.ctrlKey !== c.ctrl || e.altKey !== c.alt || e.shiftKey !== c.shift || e.metaKey !== c.meta) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === c.key) return true
  // Non-Latin layouts and Option-modified letters fall back to the physical key, as ProseMirror's keymap does.
  // Ctrl+Alt on Windows is AltGr typing a real character, so it never falls back.
  if (/^[a-z0-9]$/.test(key) || (platform === 'win' && e.ctrlKey && e.altKey)) return false
  return physicalKey(e.code) === c.key
}

export function defaultKeys(id: ShortcutId, platform: Platform): readonly string[] {
  const keys: Keys = SHORTCUTS[id].keys
  return 'mac' in keys ? keys[platform] : keys
}

export function keysFor(id: ShortcutId, platform: Platform, overrides: Overrides = {}): readonly string[] {
  return overrides[id] ?? defaultKeys(id, platform)
}

export const keyLabel = (keys: string, platform: Platform): string => label(parseKeys(keys, platform), platform)

export function shortcutsFor(platform: Platform, overrides: () => Overrides = () => ({})) {
  const keys = (id: ShortcutId): readonly string[] => keysFor(id, platform, overrides())
  return {
    label: (id: ShortcutId): string => (keys(id).length ? keyLabel(keys(id)[0], platform) : ''),
    /** For shortcuts read straight from key events; editor ones go through `keymap`. */
    matches: (e: KeyEventLike, id: Exclude<ShortcutId, EditorShortcutId>): boolean =>
      keys(id).some((k) => matches(e, parseKeys(k, platform), platform)),
    /** ProseMirror keymap for the editor shortcuts; every one must have a handler. */
    keymap: (handlers: Record<EditorShortcutId, () => boolean>): Record<string, () => boolean> =>
      Object.fromEntries((Object.keys(handlers) as EditorShortcutId[]).flatMap((id) => keys(id).map((k) => [k, handlers[id]])))
  }
}

// The Android editor runs outside Electron, has no appInfo, and uses Ctrl like Windows.
export const platform: Platform = typeof window !== 'undefined' && window.appInfo?.platform === 'darwin' ? 'mac' : 'win'

let overrides: Overrides = {}
let version = 0
const listeners = new Set<() => void>()

export const currentOverrides = (): Overrides => overrides
/** Bumped on every change, so key handlers and labels built from the table know to rebuild. */
export const shortcutsVersion = (): number => version
export function onShortcutsChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function setOverrides(next: Overrides): void {
  overrides = next
  version++
  listeners.forEach((l) => l())
}

export const shortcuts = shortcutsFor(platform, currentOverrides)
