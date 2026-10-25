import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { history, undo } from '@tiptap/pm/history'
import { EditorState, SelectionRange, TextSelection, type Transaction } from '@tiptap/pm/state'
import { CASE_COMMANDS, changeCase } from './changeCase'
import { SHORTCUTS } from '../lib/shortcuts'
import { CASE_FORMATS } from '../../../../mobile/src/editor/bridge'
import { MultiSelection } from './multiSelection'
import { br, doc, h, p, text } from './testDoc'

const code = (t: string): JSONContent => ({ type: 'codeBlock', content: [text(t)] })

function at(d: Node, needle: string, offset = 0): number {
  let found = -1
  d.descendants((n, pos) => {
    if (found === -1 && n.isText && n.text!.includes(needle)) found = pos + n.text!.indexOf(needle) + offset
  })
  if (found === -1) throw new Error(`"${needle}" not in the document`)
  return found
}

const stateOf = (d: Node, from: number, to = from): EditorState =>
  EditorState.create({ doc: d, selection: TextSelection.create(d, from, to), plugins: [history()] })
const run = (tr: Transaction | null): Transaction => {
  if (!tr) throw new Error('no transaction')
  return tr
}
const json = (d: Node): unknown => d.toJSON()
const selected = (tr: Transaction): string => tr.doc.textBetween(tr.selection.from, tr.selection.to, '|', '⏎')

describe('Change Case', () => {
  it('keeps bold and other formatting on the letters it was on, and keeps the selection', () => {
    const note = doc(h(1, 'T'), p(text('make '), text('this', 'bold'), text(' big')))
    const tr = run(changeCase(stateOf(note, at(note, 'make'), at(note, ' big', 4)), 'upper'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'T'), p(text('MAKE '), text('THIS', 'bold'), text(' BIG')))))
    expect(selected(tr)).toBe('MAKE THIS BIG')
  })

  it('gives a joining character the formatting of the word after it', () => {
    const note = doc(h(1, 'T'), p(text('my '), text('first', 'italic'), text(' note')))
    const sel = stateOf(note, at(note, 'my'), at(note, ' note', 5))
    expect(json(run(changeCase(sel, 'camel')).doc)).toEqual(json(doc(h(1, 'T'), p(text('my'), text('First', 'italic'), text('Note')))))
    expect(json(run(changeCase(sel, 'snake')).doc)).toEqual(json(doc(h(1, 'T'), p(text('my'), text('_first', 'italic'), text('_note')))))
  })

  it('converts each paragraph, Shift+Enter line and code line on its own', () => {
    const note = doc(h(1, 'T'), p(text('first line')), p(text('one two'), br, text('three four')), code('x = my value\nnext one'))
    const tr = run(changeCase(stateOf(note, at(note, 'first'), at(note, 'next one', 8)), 'kebab'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'T'), p(text('first-line')), p(text('one-two'), br, text('three-four')), code('x-my-value\nnext-one'))))
    expect(selected(tr)).toBe('first-line|one-two⏎three-four|x-my-value\nnext-one')
  })

  it('converts only the selected part of a word, taken on its own', () => {
    const note = doc(h(1, 'T'), p(text('hello world')))
    expect(json(run(changeCase(stateOf(note, at(note, 'lo'), at(note, 'world', 3)), 'title')).doc)).toEqual(json(doc(h(1, 'T'), p(text('helLo World')))))
  })

  it('converts the word at a bare cursor and leaves the cursor where it was', () => {
    const note = doc(h(1, 'T'), p(text('call my-var now')))
    const tr = run(changeCase(stateOf(note, at(note, 'my-var', 2)), 'screamingSnake'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'T'), p(text('call MY_VAR now')))))
    expect([tr.selection.empty, tr.selection.from]).toEqual([true, at(note, 'my-var', 2)])
    expect(changeCase(stateOf(note, at(note, ' now')), 'upper')).not.toBeNull()
    const spaced = doc(h(1, 'T'), p(text('a  b')))
    expect(changeCase(stateOf(spaced, at(spaced, '  b', 1)), 'upper')).toBeNull()
  })

  it('converts every range of a multi-selection and keeps them all selected', () => {
    const note = doc(h(1, 'T'), p(text('red one, red two')))
    const ranges = [at(note, 'red two'), at(note, 'red')].map((from) => new SelectionRange(note.resolve(from), note.resolve(from + 3)))
    const state = EditorState.create({ doc: note, selection: new MultiSelection(ranges) })
    const tr = run(changeCase(state, 'upper'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'T'), p(text('RED one, RED two')))))
    expect(tr.selection).toBeInstanceOf(MultiSelection)
    expect(tr.selection.ranges.map((r) => tr.doc.textBetween(r.$from.pos, r.$to.pos))).toEqual(['RED', 'RED'])
  })

  it('is one undo step, and adds none when nothing changes', () => {
    const note = doc(h(1, 'T'), p(text('one two')), p(text('three')))
    const state = stateOf(note, at(note, 'one'), at(note, 'three', 5))
    const after = state.apply(run(changeCase(state, 'pascal')))
    expect(after.doc.textBetween(0, after.doc.content.size, '|')).toBe('T|OneTwo|Three')
    let undone: EditorState | null = null
    expect(undo(after, (tr) => (undone = after.apply(tr)))).toBe(true)
    expect(json(undone!.doc)).toEqual(json(note))
    expect(changeCase(stateOf(note, at(note, 'one'), at(note, 'one', 3)), 'lower')).toBeNull()
  })
})

it('offers the phone the same formats, titled as on the desktop', () => {
  expect(CASE_FORMATS).toEqual(CASE_COMMANDS.map(({ id, format }) => ({ format, label: SHORTCUTS[id].title })))
})
