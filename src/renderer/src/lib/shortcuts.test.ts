import { afterEach, describe, expect, it, vi } from 'vitest'
import { extensions as coreExtensions, flattenExtensions, getExtensionField, type AnyExtension } from '@tiptap/core'
import { buildExtensions } from '../editor/extensions'
import { keysFor, parseKeys, SHORTCUTS, shortcutsFor, type Platform, type ShortcutId, type ShortcutScope } from './shortcuts'

// Keys the macOS menu (roles in src/main/index.ts) or the system takes first, plus standard Mac window keys.
const MAC_RESERVED = [
  'Mod-q', 'Mod-h', 'Alt-Mod-h', 'Mod-m', 'Mod-w', 'Mod-z', 'Shift-Mod-z', 'Mod-x', 'Mod-c', 'Mod-v',
  'Alt-Shift-Mod-v', 'Mod-a', 'Mod-r', 'Alt-Mod-i', 'Ctrl-Mod-f', 'Ctrl-Mod-Space', 'Mod-Space', 'Mod-Tab', 'Mod-`'
]

type Entry = { id: string; scope: ShortcutScope; keys: readonly string[]; replacesBuiltIn?: boolean }

function combo(keys: string, platform: Platform): string {
  const c = parseKeys(keys, platform)
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Meta', c.key].filter(Boolean).join('-')
}

/** Shortcuts TipTap binds itself, read from the extensions the editor actually loads. */
function builtInShortcuts(platform: Platform): Map<string, string> {
  // TipTap's core keymap adds Mac-only bindings when navigator says Mac.
  vi.stubGlobal('navigator', { platform: platform === 'mac' ? 'MacIntel' : 'Win32', userAgent: '' })
  const found = new Map<string, string>()
  const core = (Object.values(coreExtensions) as unknown[]).filter((v): v is AnyExtension => typeof v === 'object' && v !== null && 'config' in v)
  for (const ext of flattenExtensions([...core, ...buildExtensions()])) {
    if (ext.name === 'notesShortcuts') continue
    const add = getExtensionField<(() => Record<string, unknown>) | undefined>(ext, 'addKeyboardShortcuts', {
      name: ext.name,
      options: ext.options,
      storage: ext.storage,
      editor: {} as never,
      type: null as never
    })
    for (const keys of Object.keys(add?.() ?? {})) found.set(combo(keys, platform), ext.name)
  }
  return found
}

function conflicts(entries: Entry[], platform: Platform, builtIns: Map<string, string>, reserved: string[]): string[] {
  const problems: string[] = []
  const owners = new Map<string, string>()
  const taken = new Set(reserved.map((k) => combo(k, platform)))
  for (const e of entries) {
    const replaced = e.keys.map((k) => builtIns.get(combo(k, platform))).filter(Boolean)
    for (const keys of e.keys) {
      const c = combo(keys, platform)
      const owner = owners.get(c)
      if (owner) problems.push(`${e.id} and ${owner} both use ${c}`)
      owners.set(c, e.id)
      if (taken.has(c)) problems.push(`${e.id} uses ${c}, which macOS takes first`)
    }
    // The editor sees a key before the app, so an app shortcut on a TipTap key never fires while typing.
    if (e.scope === 'app' && replaced.length) problems.push(`${e.id} is unreachable in a note: TipTap's ${replaced} uses it`)
    if (e.scope === 'editor' && !!replaced.length !== !!e.replacesBuiltIn)
      problems.push(replaced.length ? `${e.id} replaces TipTap's ${replaced} without saying so` : `${e.id} is marked replacesBuiltIn but replaces nothing`)
  }
  return problems
}

const registry = (platform: Platform): Entry[] =>
  (Object.keys(SHORTCUTS) as ShortcutId[]).map((id) => {
    const s: { scope: ShortcutScope; replacesBuiltIn?: boolean } = SHORTCUTS[id]
    return { id, scope: s.scope, keys: keysFor(id, platform), replacesBuiltIn: s.replacesBuiltIn }
  })

const press = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each<Platform>(['mac', 'win'])('shortcut registry on %s', (platform) => {
  it('has no conflicts', () => {
    const reserved = platform === 'mac' ? MAC_RESERVED : []
    expect(conflicts(registry(platform), platform, builtInShortcuts(platform), reserved)).toEqual([])
  })
})

describe('conflict check', () => {
  const builtIns = builtInShortcuts('mac')

  it('reports two shortcuts on one key', () => {
    const entries: Entry[] = [
      { id: 'a', scope: 'app', keys: ['Mod-n'] },
      { id: 'b', scope: 'editor', keys: ['Mod-n'] }
    ]
    expect(conflicts(entries, 'mac', builtIns, [])).toEqual(['b and a both use Meta-n'])
  })

  it('reports a key macOS takes first', () => {
    expect(conflicts([{ id: 'a', scope: 'app', keys: ['Mod-r'] }], 'mac', builtIns, MAC_RESERVED)).toEqual([
      'a uses Meta-r, which macOS takes first'
    ])
  })

  it('reports an undeclared or stale replacement of a TipTap shortcut', () => {
    const entries: Entry[] = [
      { id: 'a', scope: 'editor', keys: ['Mod-b'] },
      { id: 'b', scope: 'editor', keys: ['Mod-Shift-t'], replacesBuiltIn: true },
      { id: 'c', scope: 'app', keys: ['Mod-i'] }
    ]
    expect(conflicts(entries, 'mac', builtIns, [])).toEqual([
      "a replaces TipTap's bold without saying so",
      'b is marked replacesBuiltIn but replaces nothing',
      "c is unreachable in a note: TipTap's italic uses it"
    ])
  })
})

describe('labels', () => {
  const ids: ShortcutId[] = ['newNote', 'newFolder', 'toggleSidebar', 'styleTitle', 'bulletList', 'blockQuote', 'insertTable', 'addRowBefore', 'listLayout']

  it('use Mac symbols', () => {
    const { label } = shortcutsFor('mac')
    expect(ids.map(label)).toEqual(['⌘N', '⇧⌘N', '⌃⌘S', '⇧⌘T', '⇧⌘7', "⌘'", '⌥⌘T', '⌥⌘↑', '⌘1'])
  })

  it('use Ctrl names on Windows', () => {
    const { label } = shortcutsFor('win')
    expect(ids.map(label)).toEqual([
      'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Alt+S', 'Ctrl+Shift+T', 'Ctrl+Shift+7', "Ctrl+'", 'Ctrl+Alt+T', 'Ctrl+Alt+Up', 'Ctrl+1'
    ])
  })
})

describe('editor keymap', () => {
  it('binds the same ProseMirror keys on every platform', () => {
    const handlers = Object.fromEntries(
      (Object.keys(SHORTCUTS) as ShortcutId[]).filter((id) => SHORTCUTS[id].scope === 'editor').map((id) => [id, () => true])
    ) as Parameters<ReturnType<typeof shortcutsFor>['keymap']>[0]
    const expected = [
      'Mod-Shift-t', 'Mod-Shift-h', 'Mod-Shift-j', 'Mod-Shift-b', 'Mod-Shift-m', 'Mod-Shift-7', 'Mod-Shift-8', 'Mod-Shift-9',
      'Mod-Shift-l', 'Mod-Shift-u', "Mod-'", 'Mod-l', 'Mod-Alt-t', 'Mod-]', 'Mod-[', 'Mod-Alt-ArrowUp', 'Mod-Alt-ArrowDown',
      'Mod-Alt-ArrowLeft', 'Mod-Alt-ArrowRight'
    ]
    expect(Object.keys(shortcutsFor('mac').keymap(handlers))).toEqual(expected)
    expect(Object.keys(shortcutsFor('win').keymap(handlers))).toEqual(expected)
  })
})

describe('app shortcut matching on Mac', () => {
  const { matches } = shortcutsFor('mac')

  it('needs Cmd and exactly the listed modifiers', () => {
    expect(matches(press('n', 'KeyN', { metaKey: true }), 'newNote')).toBe(true)
    expect(matches(press('n', 'KeyN', { ctrlKey: true }), 'newNote')).toBe(false)
    expect(matches(press('N', 'KeyN', { metaKey: true, shiftKey: true }), 'newNote')).toBe(false)
    expect(matches(press('N', 'KeyN', { metaKey: true, shiftKey: true }), 'newFolder')).toBe(true)
  })

  it('toggles the sidebar on Ctrl-Cmd-S only', () => {
    expect(matches(press('s', 'KeyS', { metaKey: true, ctrlKey: true }), 'toggleSidebar')).toBe(true)
    expect(matches(press('s', 'KeyS', { metaKey: true }), 'toggleSidebar')).toBe(false)
  })

  it('reads Option-Cmd-F by its physical key, since Option turns f into ƒ', () => {
    expect(matches(press('ƒ', 'KeyF', { metaKey: true, altKey: true }), 'search')).toBe(true)
  })

  it('closes the gallery on a plain Escape only', () => {
    expect(matches(press('Escape', 'Escape'), 'closeGallery')).toBe(true)
    expect(matches(press('Escape', 'Escape', { shiftKey: true }), 'closeGallery')).toBe(false)
  })
})

describe('app shortcut matching on Windows', () => {
  const { matches } = shortcutsFor('win')

  it('needs Ctrl and exactly the listed modifiers', () => {
    expect(matches(press('n', 'KeyN', { ctrlKey: true }), 'newNote')).toBe(true)
    expect(matches(press('n', 'KeyN', { ctrlKey: true, altKey: true }), 'newNote')).toBe(false)
    expect(matches(press('F', 'KeyF', { ctrlKey: true, shiftKey: true }), 'search')).toBe(false)
    expect(matches(press('f', 'KeyF', { ctrlKey: true, altKey: true }), 'search')).toBe(true)
  })

  it('works on non-Latin layouts through the physical key', () => {
    expect(matches(press('د', 'KeyD', { ctrlKey: true }), 'duplicateNote')).toBe(true)
    expect(matches(press('&', 'Digit1', { ctrlKey: true }), 'listLayout')).toBe(true)
  })

  it('leaves AltGr characters alone', () => {
    expect(matches(press('s', 'KeyS', { ctrlKey: true, altKey: true }), 'toggleSidebar')).toBe(true)
    expect(matches(press('ś', 'KeyS', { ctrlKey: true, altKey: true }), 'toggleSidebar')).toBe(false)
  })
})
