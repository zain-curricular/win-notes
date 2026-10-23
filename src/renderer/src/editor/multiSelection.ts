import { Extension } from '@tiptap/core'
import { Fragment, Mark, Slice, type Node, type ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, SelectionRange, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Mappable } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { blockText, findOccurrences, isWordChar } from './occurrences'
import type { TextRange } from './folds'
import { shortcuts } from '../lib/shortcuts'

const EDIT = 'multiSelectionEdit'
// Far above anything a person selects one press at a time; keeps a runaway note from freezing the editor.
const MAX_MATCHES = 10_000

const rangeAt = (doc: Node, from: number, to: number): SelectionRange => new SelectionRange(doc.resolve(from), doc.resolve(to))

/**
 * Several selected ranges at once, newest first. ranges[0] is the main range: the browser draws it, and any command
 * that only understands one selection acts on it. `wholeWord` is set when the selection started from a bare cursor,
 * so later presses of Ctrl/Cmd+D skip copies inside longer words, as VS Code does.
 */
export class MultiSelection extends Selection {
  readonly wholeWord: boolean

  constructor(ranges: readonly SelectionRange[], { wholeWord = false } = {}) {
    super(ranges[0].$from, ranges[0].$to, [...ranges])
    this.wholeWord = wholeWord
  }

  map(doc: Node, mapping: Mappable): Selection {
    const seen = new Set<string>()
    const ranges: SelectionRange[] = []
    for (const r of this.ranges) {
      const from = mapping.map(r.$from.pos)
      const to = mapping.map(r.$to.pos)
      if (seen.has(`${from}:${to}`)) continue
      seen.add(`${from}:${to}`)
      ranges.push(rangeAt(doc, from, to))
    }
    if (ranges.length > 1) return new MultiSelection(ranges, { wholeWord: this.wholeWord })
    return TextSelection.between(ranges[0].$from, ranges[0].$to)
  }

  eq(other: Selection): boolean {
    return (
      other instanceof MultiSelection &&
      other.ranges.length === this.ranges.length &&
      other.ranges.every((r, i) => r.$from.pos === this.ranges[i].$from.pos && r.$to.pos === this.ranges[i].$to.pos)
    )
  }

  /** Copy and cut take every selected piece in document order, one per line, as VS Code does. */
  content(): Slice {
    const doc = this.$from.doc
    const { schema } = doc.type
    const pieces = this.ranges
      .filter((r) => r.$from.pos !== r.$to.pos)
      .sort((a, b) => a.$from.pos - b.$from.pos)
      .map((r) => doc.textBetween(r.$from.pos, r.$to.pos))
    if (!pieces.length) return Slice.empty
    return new Slice(Fragment.from(pieces.map((t) => schema.nodes.paragraph.create(null, schema.text(t)))), 1, 1)
  }

  // Undo returns to a single selection.
  getBookmark() {
    return TextSelection.between(this.$from, this.$to).getBookmark()
  }

  toJSON() {
    return { type: 'text', anchor: this.$from.pos, head: this.$to.pos }
  }
}

function wordAt($pos: ResolvedPos): TextRange | null {
  if (!$pos.parent.isTextblock) return null
  const text = blockText($pos.parent)
  let start = $pos.parentOffset
  let end = start
  while (start > 0 && isWordChar(text[start - 1])) start--
  while (end < text.length && isWordChar(text[end])) end++
  return start === end ? null : { from: $pos.start() + start, to: $pos.start() + end }
}

/** The text and copies to search for: the main range's text, or the word under a bare cursor. */
function target(state: EditorState): { main: TextRange; wholeWord: boolean; matches: TextRange[] } | null {
  const sel = state.selection
  if (!(sel instanceof TextSelection || sel instanceof MultiSelection)) return null
  let main: TextRange = { from: sel.ranges[0].$from.pos, to: sel.ranges[0].$to.pos }
  let wholeWord = sel instanceof MultiSelection && sel.wholeWord
  if (sel instanceof TextSelection && sel.empty) {
    const word = wordAt(sel.$from)
    if (!word) return null
    main = word
    wholeWord = true
  }
  if (main.from === main.to || !state.doc.resolve(main.from).sameParent(state.doc.resolve(main.to))) return null
  const needle = state.doc.textBetween(main.from, main.to, undefined, '￼')
  return { main, wholeWord, matches: findOccurrences(state.doc, needle, { wholeWord, limit: MAX_MATCHES }) }
}

/** Ctrl/Cmd+D: select the word under the cursor, then add the next copy after the newest one, wrapping round. */
export function selectNextMatch(state: EditorState): Transaction | null {
  const t = target(state)
  if (!t) return null
  const { doc } = state
  if (state.selection.empty) return state.tr.setSelection(new MultiSelection([rangeAt(doc, t.main.from, t.main.to)], { wholeWord: true }))
  const taken = new Set(state.selection.ranges.map((r) => r.$from.pos))
  const next = t.matches.find((m) => m.from >= t.main.to && !taken.has(m.from)) ?? t.matches.find((m) => !taken.has(m.from))
  if (!next) return null
  const ranges = [rangeAt(doc, next.from, next.to), ...state.selection.ranges]
  return state.tr.setSelection(new MultiSelection(ranges, { wholeWord: t.wholeWord })).scrollIntoView()
}

/** Ctrl/Cmd+F2: select every copy at once, keeping the current one as the main range. */
export function selectAllMatches(state: EditorState): Transaction | null {
  const t = target(state)
  if (!t || !t.matches.length) return null
  const others = t.matches.filter((m) => m.from !== t.main.from).map((m) => rangeAt(state.doc, m.from, m.to))
  return state.tr.setSelection(new MultiSelection([rangeAt(state.doc, t.main.from, t.main.to), ...others], { wholeWord: t.wholeWord }))
}

export function collapseToMain(state: EditorState): Transaction | null {
  const sel = state.selection
  return sel instanceof MultiSelection ? state.tr.setSelection(TextSelection.between(sel.$from, sel.$to)) : null
}

/** Applies an edit at every range in one transaction and leaves a caret where each edit ended. */
function editAll(state: EditorState, edit: (tr: Transaction, range: SelectionRange, from: number, to: number) => number): Transaction | null {
  const sel = state.selection
  if (!(sel instanceof MultiSelection)) return null
  const tr = state.tr
  const carets = sel.ranges.map((r) => {
    const caret = edit(tr, r, tr.mapping.map(r.$from.pos), tr.mapping.map(r.$to.pos))
    return { pos: caret, step: tr.steps.length }
  })
  // Map each caret through the edits made after it; -1 keeps it before text inserted right where it stands.
  const ranges = carets.map(({ pos, step }) => {
    const mapped = tr.mapping.slice(step).map(pos, -1)
    return rangeAt(tr.doc, mapped, mapped)
  })
  return tr.setSelection(new MultiSelection(ranges, { wholeWord: sel.wholeWord })).setMeta(EDIT, true).scrollIntoView()
}

/** Typing: replaces every range with the text, each keeping the formatting it had. */
export function insertAtAll(state: EditorState, text: string): Transaction | null {
  return editAll(state, (tr, range, from, to) => {
    const { $from, $to } = range
    const marks = $from.pos === $to.pos ? $from.marks() : ($from.marksAcross($to) ?? Mark.none)
    tr.replaceWith(from, to, state.schema.text(text, marks))
    return from + text.length
  })
}

// One character, or two for a character outside the Basic Multilingual Plane such as an emoji.
function charLength($pos: ResolvedPos, { forward }: { forward: boolean }): number {
  const text = blockText($pos.parent)
  const i = $pos.parentOffset
  const pair = forward ? text.slice(i, i + 2) : text.slice(i - 2, i)
  return pair.length === 2 && /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(pair) ? 2 : 1
}

/** Backspace and Delete at every range. A caret at the edge of its block stays put instead of merging blocks. */
export function deleteAtAll(state: EditorState, { forward }: { forward: boolean }): Transaction | null {
  return editAll(state, (tr, _range, from, to) => {
    if (from !== to) {
      tr.delete(from, to)
      return from
    }
    const $pos = tr.doc.resolve(from)
    if (!$pos.parent.isTextblock) return from
    if (forward) {
      if ($pos.parentOffset === $pos.parent.content.size) return from
      tr.delete(from, from + charLength($pos, { forward }))
      return from
    }
    if ($pos.parentOffset === 0) return from
    const size = charLength($pos, { forward })
    tr.delete(from - size, from)
    return from - size
  })
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'OS'])
const isTyping = (e: KeyboardEvent): boolean => e.key.length === 1 && !e.ctrlKey && !e.metaKey
const isClipboard = (e: KeyboardEvent): boolean => (e.ctrlKey || e.metaKey) && ['KeyC', 'KeyX', 'KeyV'].includes(e.code)
const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey

function caret(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'multi-caret'
  return el
}

export function multiSelectionPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('multiSelection'),
    props: {
      handleKeyDown(view, event) {
        const run = (tr: Transaction | null): boolean => {
          if (tr) view.dispatch(tr)
          // These keys belong to the note, so the window's app shortcuts (Duplicate Note, close gallery) must not see them.
          event.stopPropagation()
          return true
        }
        if (shortcuts.matches(event, 'selectNextMatch')) return run(selectNextMatch(view.state))
        if (shortcuts.matches(event, 'selectAllMatches')) return run(selectAllMatches(view.state))
        if (!(view.state.selection instanceof MultiSelection)) return false
        if (shortcuts.matches(event, 'clearMultiSelection')) return run(collapseToMain(view.state))
        if (event.key === 'Backspace' && plain(event)) return run(deleteAtAll(view.state, { forward: false }))
        if (event.key === 'Delete' && plain(event)) return run(deleteAtAll(view.state, { forward: true }))
        if (MODIFIER_KEYS.has(event.key) || isTyping(event) || isClipboard(event)) return false
        // Anything else (Enter, Tab, arrows, formatting keys) runs exactly as it would with one selection.
        const tr = collapseToMain(view.state)
        if (tr) view.dispatch(tr)
        return false
      },
      handleTextInput(view, _from, _to, text) {
        const tr = insertAtAll(view.state, text)
        if (tr) view.dispatch(tr)
        return !!tr
      },
      handleDOMEvents: {
        // An input method composes into the browser's own selection, which is only the main range.
        compositionstart(view) {
          const tr = collapseToMain(view.state)
          if (tr) view.dispatch(tr)
          return false
        }
      },
      decorations(state) {
        const sel = state.selection
        if (!(sel instanceof MultiSelection)) return null
        return DecorationSet.create(
          state.doc,
          sel.ranges.slice(1).map((r) =>
            r.$from.pos === r.$to.pos
              ? Decoration.widget(r.$from.pos, caret, { key: 'multi-caret', side: -1, ignoreSelection: true })
              : Decoration.inline(r.$from.pos, r.$to.pos, { class: 'multi-selection' })
          )
        )
      }
    },
    // Fail-safe: a document change made by anything else (toolbar, sync, autocorrect) ends the multi-selection.
    appendTransaction(trs, _old, state) {
      if (!(state.selection instanceof MultiSelection)) return null
      return trs.some((tr) => tr.docChanged && !tr.getMeta(EDIT)) ? collapseToMain(state) : null
    }
  })
}

export const MultiSelect = Extension.create({
  name: 'multiSelect',
  // Ahead of the formatting shortcuts, so a key can first end the multi-selection.
  priority: 1100,
  addProseMirrorPlugins: () => [multiSelectionPlugin()]
})
