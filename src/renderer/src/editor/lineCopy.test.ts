import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { copyLines, cutLine, lineCopyAt, pasteLines } from './lineCopy'
import { doc, h, p, text } from './testDoc'

const ul = (...items: JSONContent[]): JSONContent => ({ type: 'bulletList', content: items })
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })
const tasks = (...items: JSONContent[]): JSONContent => ({ type: 'taskList', content: items })
const task = (checked: boolean, t: string): JSONContent => ({ type: 'taskItem', attrs: { checked }, content: [p(text(t))] })
const code = (t: string): JSONContent => ({ type: 'codeBlock', content: [text(t)] })
const line = (t: string): JSONContent => p(text(t))
const empty: JSONContent = { type: 'paragraph' }

/** Position `offset` characters into the first text that contains `needle`. */
function at(d: Node, needle: string, offset = 0): number {
  let found = -1
  d.descendants((n, pos) => {
    if (found === -1 && n.isText && n.text!.includes(needle)) found = pos + n.text!.indexOf(needle) + offset
  })
  if (found === -1) throw new Error(`"${needle}" not in the document`)
  return found
}

const stateOf = (d: Node, from: number, to = from): EditorState =>
  EditorState.create({ doc: d, selection: TextSelection.create(d, from, to) })

const run = (tr: Transaction | null): Transaction => {
  if (!tr) throw new Error('no transaction')
  return tr
}
const json = (d: Node): unknown => d.toJSON()
const lineOfCursor = (tr: Transaction): number => tr.selection.$from.index(0)

describe('Copy Line Down / Up', () => {
  const note = doc(h(1, 'Title'), line('one'), line('two'))

  it('copies the line below and moves the cursor onto the copy', () => {
    const tr = run(copyLines(stateOf(note, at(note, 'one', 1)), 'down'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('one'), line('two'))))
    expect([lineOfCursor(tr), tr.selection.$from.parentOffset]).toEqual([2, 1])
  })

  it('copies the line above and keeps the cursor on the upper copy', () => {
    const tr = run(copyLines(stateOf(note, at(note, 'one', 1)), 'up'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('one'), line('two'))))
    expect(lineOfCursor(tr)).toBe(1)
  })

  it('copies an empty line, the title and the last line', () => {
    const blank = doc(h(1, 'Title'), empty, line('two'))
    expect(json(run(copyLines(stateOf(blank, at(blank, 'Title') + 7), 'down')).doc)).toEqual(json(doc(h(1, 'Title'), empty, empty, line('two'))))
    expect(json(run(copyLines(stateOf(note, at(note, 'Title')), 'down')).doc)).toEqual(
      json(doc(h(1, 'Title'), h(1, 'Title'), line('one'), line('two')))
    )
    const tr = run(copyLines(stateOf(note, at(note, 'two', 3)), 'down'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('two'), line('two'))))
    expect(lineOfCursor(tr)).toBe(3)
  })

  it('copies every line a selection touches, keeping the selection on the copy', () => {
    const tr = run(copyLines(stateOf(note, at(note, 'one', 1), at(note, 'two', 2)), 'down'))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('two'), line('one'), line('two'))))
    expect(tr.doc.textBetween(tr.selection.from, tr.selection.to, '|')).toBe('ne|tw')
    expect(lineOfCursor(tr)).toBe(3)
  })

  it('copies a list item as a new item, without its sub-items', () => {
    const list = doc(h(1, 'T'), ul(li(line('a')), li(line('b'))))
    expect(json(run(copyLines(stateOf(list, at(list, 'a')), 'down')).doc)).toEqual(json(doc(h(1, 'T'), ul(li(line('a')), li(line('a')), li(line('b'))))))
    const nested = doc(h(1, 'T'), ul(li(line('a'), ul(li(line('child')))), li(line('b'))))
    expect(json(run(copyLines(stateOf(nested, at(nested, 'a')), 'down')).doc)).toEqual(
      json(doc(h(1, 'T'), ul(li(line('a'), ul(li(line('child')))), li(line('a')), li(line('b')))))
    )
  })

  it('keeps a checklist item ticked, copies one line of code, and never copies a fold', () => {
    const checklist = doc(h(1, 'T'), tasks(task(true, 'done')))
    expect(json(run(copyLines(stateOf(checklist, at(checklist, 'done')), 'down')).doc)).toEqual(
      json(doc(h(1, 'T'), tasks(task(true, 'done'), task(true, 'done'))))
    )
    const snippet = doc(h(1, 'T'), code('x = 1\ny = 2'))
    expect(json(run(copyLines(stateOf(snippet, at(snippet, 'y = 2', 1)), 'down')).doc)).toEqual(json(doc(h(1, 'T'), code('x = 1\ny = 2\ny = 2'))))
    const folded = doc(h(1, 'T'), h(2, 'Part', { collapsed: true }), line('hidden'))
    expect(json(run(copyLines(stateOf(folded, at(folded, 'Part')), 'down')).doc)).toEqual(
      json(doc(h(1, 'T'), h(2, 'Part', { collapsed: true }), h(2, 'Part'), line('hidden')))
    )
  })
})

describe('Ctrl/Cmd+C, X and V with nothing selected', () => {
  const note = doc(h(1, 'Title'), line('one'), line('two'))

  it('copies the whole line with a trailing newline, and only when nothing is selected', () => {
    expect(lineCopyAt(stateOf(note, at(note, 'one', 2)))?.text).toBe('one\n')
    expect(lineCopyAt(stateOf(note, at(note, 'one'), at(note, 'one', 2)))).toBeNull()
  })

  it('cuts the line, leaves an empty line when it was the only one, and keeps a bullet that has sub-items', () => {
    expect(json(run(cutLine(stateOf(note, at(note, 'one')))).doc)).toEqual(json(doc(h(1, 'Title'), line('two'))))
    const single = doc(line('only'))
    expect(json(run(cutLine(stateOf(single, at(single, 'only')))).doc)).toEqual(json(doc(empty)))
    const nested = doc(h(1, 'T'), ul(li(line('a'), ul(li(line('child'))))))
    expect(json(run(cutLine(stateOf(nested, at(nested, 'a')))).doc)).toEqual(json(doc(h(1, 'T'), ul(li(empty, ul(li(line('child'))))))))
    const snippet = doc(h(1, 'T'), code('x\ny\nz'))
    expect(json(run(cutLine(stateOf(snippet, at(snippet, 'y')))).doc)).toEqual(json(doc(h(1, 'T'), code('x\nz'))))
    expect(json(run(cutLine(stateOf(snippet, at(snippet, 'z')))).doc)).toEqual(json(doc(h(1, 'T'), code('x\ny'))))
  })

  it('pastes a line copy above the cursor line and leaves the cursor where it was', () => {
    const copy = lineCopyAt(stateOf(note, at(note, 'one')))!
    const tr = run(pasteLines(stateOf(note, at(note, 'two', 2)), copy))
    expect(json(tr.doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('one'), line('two'))))
    expect([tr.selection.$from.parent.textContent, tr.selection.$from.parentOffset]).toEqual(['two', 2])
  })

  it('pastes a copied list item into ordinary text as a list, and plain text as lines', () => {
    const list = doc(h(1, 'T'), ul(li(line('a'))), line('below'))
    const copy = lineCopyAt(stateOf(list, at(list, 'a')))!
    expect(json(run(pasteLines(stateOf(list, at(list, 'below')), copy)).doc)).toEqual(json(doc(h(1, 'T'), ul(li(line('a'))), ul(li(line('a'))), line('below'))))
    const codeCopy = { text: 'x = 1\n', content: null }
    expect(json(run(pasteLines(stateOf(note, at(note, 'two')), codeCopy)).doc)).toEqual(json(doc(h(1, 'Title'), line('one'), line('x = 1'), line('two'))))
  })
})
