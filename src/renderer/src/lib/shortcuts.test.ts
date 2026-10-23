import { describe, expect, it, vi } from 'vitest'
import { keydownHandler } from '@tiptap/pm/keymap'
import {
  builtInKeys,
  checkKeys,
  findConflicts,
  loadKeybindings,
  MAC_RESERVED,
  recordKeys,
  registryEntries,
  reservedKeys,
  saveKeys,
  validOverrides,
  type Entry
} from './keybindings'
import { currentOverrides, setOverrides, SHORTCUTS, shortcutsFor, type Platform, type ShortcutId } from './shortcuts'

/** TipTap's own keys as they are on `platform`: its core keymap adds Mac-only bindings when navigator says Mac. */
function builtInShortcuts(platform: Platform): Map<string, string> {
  vi.stubGlobal('navigator', { platform: platform === 'mac' ? 'MacIntel' : 'Win32', userAgent: '' })
  const found = builtInKeys(platform)
  // Also called while tests are collected, so the stub must not outlive this call.
  vi.unstubAllGlobals()
  return found
}

const press = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods
})

describe.each<Platform>(['mac', 'win'])('shortcut registry on %s', (platform) => {
  it('has no conflicts', () => {
    expect(findConflicts(registryEntries(platform), platform, builtInShortcuts(platform), reservedKeys(platform))).toEqual([])
  })
})

describe('conflict check', () => {
  const builtIns = builtInShortcuts('mac')

  it('reports two shortcuts on one key', () => {
    const entries: Entry[] = [
      { id: 'a', scope: 'app', keys: ['Mod-n'] },
      { id: 'b', scope: 'editor', keys: ['Mod-n'] }
    ]
    expect(findConflicts(entries, 'mac', builtIns, [])).toEqual([{ kind: 'clash', id: 'b', with: 'a', key: 'Meta-n' }])
  })

  it('allows only the overlap a shortcut declares', () => {
    const entries: Entry[] = [
      { id: 'a', scope: 'app', keys: ['Mod-d'] },
      { id: 'b', scope: 'selection', keys: ['Mod-d'], shadows: 'a' },
      { id: 'c', scope: 'selection', keys: ['Mod-d'], shadows: 'x' }
    ]
    expect(findConflicts(entries, 'mac', builtIns, [])).toEqual([{ kind: 'clash', id: 'c', with: 'b', key: 'Meta-d' }])
  })

  it('reports a key macOS takes first', () => {
    expect(findConflicts([{ id: 'a', scope: 'app', keys: ['Mod-r'] }], 'mac', builtIns, MAC_RESERVED)).toEqual([
      { kind: 'reserved', id: 'a', key: 'Meta-r' }
    ])
  })

  it('reports an undeclared or stale replacement of a TipTap shortcut', () => {
    const entries: Entry[] = [
      { id: 'a', scope: 'editor', keys: ['Mod-b'] },
      { id: 'b', scope: 'editor', keys: ['Mod-Shift-t'], replacesBuiltIn: true },
      { id: 'c', scope: 'app', keys: ['Mod-i'] }
    ]
    expect(findConflicts(entries, 'mac', builtIns, [])).toEqual([
      { kind: 'undeclared', id: 'a', builtIn: 'bold' },
      { kind: 'stale', id: 'b' },
      { kind: 'unreachable', id: 'c', builtIn: 'italic' }
    ])
  })
})

describe('labels', () => {
  const ids: ShortcutId[] = [
    'newNote', 'newFolder', 'toggleSidebar', 'styleTitle', 'bulletList', 'blockQuote', 'insertTable', 'addRowBefore', 'listLayout',
    'matchCase', 'selectNextMatch', 'selectAllMatches', 'alignLeft', 'alignCenter', 'alignRight',
    'zoomIn', 'zoomOut', 'resetZoom'
  ]

  it('use Mac symbols', () => {
    const { label } = shortcutsFor('mac')
    expect(ids.map(label)).toEqual(['⌘N', '⇧⌘N', '⌃⌘S', '⇧⌘T', '⇧⌘7', "⌘'", '⌥⌘T', '⌥⌘↑', '⌘1', '⌥⌘C', '⌘D', '⌘F2', '⌘{', '⌘|', '⌘}', '⌘=', '⌘-', '⌘0'])
  })

  it('use Ctrl names on Windows', () => {
    const { label } = shortcutsFor('win')
    expect(ids.map(label)).toEqual([
      'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Alt+S', 'Ctrl+Shift+T', 'Ctrl+Shift+7', "Ctrl+'", 'Ctrl+Alt+T', 'Ctrl+Alt+Up', 'Ctrl+1',
      'Alt+C', 'Ctrl+D', 'Ctrl+F2', 'Ctrl+{', 'Ctrl+|', 'Ctrl+}', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0'
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
      'Mod-Alt-ArrowLeft', 'Mod-Alt-ArrowRight', 'Mod-{', 'Mod-Shift-[', 'Mod-|', 'Mod-Shift-\\', 'Mod-}', 'Mod-Shift-]',
      'Alt-Shift-ArrowDown', 'Alt-Shift-ArrowUp'
    ]
    expect(Object.keys(shortcutsFor('mac').keymap(handlers))).toEqual(expected)
    expect(Object.keys(shortcutsFor('win').keymap(handlers))).toEqual(expected)
  })
})

// macOS always reports Cmd+Shift+[ as {, so only Windows can send the plain bracket with Shift held.
describe.each<[Platform, [string, number][], string[]]>([
  ['mac', [['{', 219], ['}', 221], ['|', 220]], ['alignLeft', 'alignRight', 'alignCenter']],
  [
    'win',
    [['{', 219], ['[', 219], ['}', 221], [']', 221], ['|', 220], ['\\', 220]],
    ['alignLeft', 'alignLeft', 'alignRight', 'alignRight', 'alignCenter', 'alignCenter']
  ]
])('alignment keys through the ProseMirror keymap on %s', (platform, shiftBrackets, aligned) => {
  const mac = platform === 'mac'
  const fired: string[] = []
  const handlers = Object.fromEntries(
    (Object.keys(SHORTCUTS) as ShortcutId[]).filter((id) => SHORTCUTS[id].scope === 'editor').map((id) => [id, () => (fired.push(id), true)])
  ) as Parameters<ReturnType<typeof shortcutsFor>['keymap']>[0]
  // prosemirror-keymap resolves Mod from the host's navigator, so it is resolved here for the platform under test.
  const bindings = Object.entries(shortcutsFor(platform).keymap(handlers)).map(([k, f]) => [k.replace('Mod-', mac ? 'Meta-' : 'Ctrl-'), f])
  const handle = keydownHandler(Object.fromEntries(bindings))
  const keyDown = (key: string, keyCode: number, shiftKey: boolean): string | undefined => {
    fired.length = 0
    handle({} as never, { key, keyCode, shiftKey, ctrlKey: !mac, altKey: false, metaKey: mac } as KeyboardEvent)
    return fired[0]
  }

  it('reaches the alignment from Shift+bracket, never indent or outdent', () => {
    expect(shiftBrackets.map(([key, code]) => keyDown(key, code, true))).toEqual(aligned)
    expect([keyDown('[', 219, false), keyDown(']', 221, false)]).toEqual(['outdent', 'indent'])
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

  it('reads the Option-Cmd search toggles by their physical keys', () => {
    expect(matches(press('ç', 'KeyC', { metaKey: true, altKey: true }), 'matchCase')).toBe(true)
    expect(matches(press('∑', 'KeyW', { metaKey: true, altKey: true }), 'matchWholeWord')).toBe(true)
    expect(matches(press('®', 'KeyR', { metaKey: true, altKey: true }), 'useRegex')).toBe(true)
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

  it('zooms from the US, German and numpad keys, and resets from 0 on French keyboards', () => {
    expect(matches(press('=', 'Equal', { ctrlKey: true }), 'zoomIn')).toBe(true)
    expect(matches(press('+', 'Equal', { ctrlKey: true, shiftKey: true }), 'zoomIn')).toBe(true)
    expect(matches(press('+', 'BracketRight', { ctrlKey: true }), 'zoomIn')).toBe(true)
    expect(matches(press('+', 'NumpadAdd', { ctrlKey: true }), 'zoomIn')).toBe(true)
    expect(matches(press('-', 'NumpadSubtract', { ctrlKey: true }), 'zoomOut')).toBe(true)
    expect(matches(press('à', 'Digit0', { ctrlKey: true }), 'resetZoom')).toBe(true)
    expect(matches(press('=', 'Equal', { ctrlKey: true, altKey: true }), 'zoomIn')).toBe(false)
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

describe('changing a shortcut', () => {
  const winBuiltIns = builtInShortcuts('win')
  const check = (id: ShortcutId, keys: string[]) => checkKeys(id, keys, 'win', {}, winBuiltIns)

  it('uses the new keys instead of the defaults', () => {
    const { matches, label } = shortcutsFor('win', () => ({ duplicateNote: ['Mod-Shift-d'] }))
    expect(matches(press('D', 'KeyD', { ctrlKey: true, shiftKey: true }), 'duplicateNote')).toBe(true)
    expect(matches(press('d', 'KeyD', { ctrlKey: true }), 'duplicateNote')).toBe(false)
    expect(label('duplicateNote')).toBe('Ctrl+Shift+D')
  })

  it('refuses a key another action, the editor or copy and paste already uses', () => {
    expect(check('duplicateNote', ['Mod-n'])).toEqual({ kind: 'clash', with: 'newNote' })
    expect(check('divider', ['Mod-Shift-['])).toEqual({ kind: 'clash', with: 'alignLeft' })
    expect(checkKeys('blockQuote', ['Mod-Shift-;'], 'win', { divider: ['Mod-:'] }, winBuiltIns)).toEqual({ kind: 'clash', with: 'divider' })
    expect(check('divider', ['Mod-b'])).toEqual({ kind: 'editor', builtIn: 'bold' })
    expect(check('newNote', ['Mod-v'])).toEqual({ kind: 'reserved' })
    expect(check('divider', ['Mod-Shift-k'])).toBeNull()
  })

  it('refuses keys that would type or move the cursor', () => {
    expect(check('divider', ['k'])).toEqual({ kind: 'typing' })
    expect(check('divider', ['Shift-ArrowDown'])).toEqual({ kind: 'typing' })
    expect(checkKeys('divider', ['Alt-e'], 'mac', {}, builtInShortcuts('mac'))).toEqual({ kind: 'typing' })
    expect(check('divider', ['Alt-e'])).toBeNull()
    expect(check('divider', ['F6'])).toBeNull()
  })

  it('records the physical key, whatever the layout', () => {
    expect(recordKeys(press('D', 'KeyD', { ctrlKey: true, shiftKey: true }), 'win')).toBe('Mod-Shift-d')
    expect(recordKeys(press('د', 'KeyD', { ctrlKey: true }), 'win')).toBe('Mod-d')
    expect(recordKeys(press('{', 'BracketLeft', { metaKey: true, shiftKey: true }), 'mac')).toBe('Mod-Shift-[')
    expect(recordKeys(press('ArrowDown', 'ArrowDown', { altKey: true, shiftKey: true }), 'mac')).toBe('Alt-Shift-ArrowDown')
    expect(recordKeys(press('+', 'NumpadAdd', { ctrlKey: true }), 'win')).toBe('Mod-+')
    expect(recordKeys(press('Shift', 'ShiftLeft', { shiftKey: true }), 'win')).toBeNull()
  })

  it('keeps only saved keys that still make sense', () => {
    const saved = { divider: ['Mod-Shift-k'], closeGallery: ['Mod-e'], gone: ['Mod-g'], newNote: 'Mod-n', search: ['k'] }
    expect(validOverrides(saved, 'win')).toEqual({ divider: ['Mod-Shift-k'] })
  })

  it('remembers changed keys after a restart and resets them', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
    try {
      saveKeys('divider', ['Mod-Shift-k'])
      setOverrides({})
      loadKeybindings('win')
      expect(currentOverrides()).toEqual({ divider: ['Mod-Shift-k'] })
      saveKeys('divider', null)
      loadKeybindings('win')
      expect(currentOverrides()).toEqual({})
    } finally {
      vi.unstubAllGlobals()
      setOverrides({})
    }
  })
})
