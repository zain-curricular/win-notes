import { describe, expect, it } from 'vitest'
import { history, undo } from '@tiptap/pm/history'
import { EditorState, TextSelection, type Selection, type Transaction } from '@tiptap/pm/state'
import { collapseToMain, deleteAtAll, insertAtAll, MultiSelection, multiSelectionPlugin, selectAllMatches, selectNextMatch } from './multiSelection'
import { doc, p, text } from './testDoc'

// "cat category cat" holds cat at 1-4, category at 5-13 (cat at 5-8) and cat at 14-17; the bold cat is at 19-22.
const NOTE = doc(p(text('cat category cat')), p(text('cat', 'bold')))

const stateAt = (from: number, to = from, d = NOTE): EditorState =>
  EditorState.create({ doc: d, plugins: [multiSelectionPlugin(), history()], selection: TextSelection.create(d, from, to) })
const apply = (state: EditorState, tr: Transaction | null): EditorState => {
  if (!tr) throw new Error('command did nothing')
  return state.apply(tr)
}
const ranges = (sel: Selection): number[][] => sel.ranges.map((r) => [r.$from.pos, r.$to.pos])
const texts = (state: EditorState): string[] => {
  const out: string[] = []
  state.doc.forEach((block) => out.push(block.textContent))
  return out
}

describe('Ctrl/Cmd+D', () => {
  it('selects the word under the cursor, then whole-word copies, newest first', () => {
    let s = apply(stateAt(2), selectNextMatch(stateAt(2)))
    expect(ranges(s.selection)).toEqual([[1, 4]])
    s = apply(s, selectNextMatch(s))
    expect(ranges(s.selection)).toEqual([[14, 17], [1, 4]])
    s = apply(s, selectNextMatch(s))
    expect(ranges(s.selection)).toEqual([[19, 22], [14, 17], [1, 4]])
    expect(selectNextMatch(s)).toBeNull()
  })

  it('matches inside longer words when the text was selected by hand', () => {
    const s = apply(stateAt(1, 4), selectNextMatch(stateAt(1, 4)))
    expect(ranges(s.selection)).toEqual([[5, 8], [1, 4]])
  })

  it('wraps to the top of the note after the last copy', () => {
    let s = apply(stateAt(14, 17), selectNextMatch(stateAt(14, 17)))
    s = apply(s, selectNextMatch(s))
    expect(ranges(s.selection)).toEqual([[1, 4], [19, 22], [14, 17]])
  })

  it('takes the word touching the cursor, and does nothing between two spaces', () => {
    expect(ranges(apply(stateAt(4), selectNextMatch(stateAt(4))).selection)).toEqual([[1, 4]])
    const spaced = doc(p(text('a  b')))
    expect(selectNextMatch(stateAt(3, 3, spaced))).toBeNull()
  })
})

describe('Ctrl/Cmd+F2', () => {
  it('selects every copy, keeping the current one as the main range', () => {
    const s = apply(stateAt(15), selectAllMatches(stateAt(15)))
    expect(ranges(s.selection)).toEqual([[14, 17], [1, 4], [19, 22]])
  })
})

describe('editing several ranges', () => {
  const allCats = (): EditorState => apply(stateAt(2), selectAllMatches(stateAt(2)))

  it('typing replaces every range, keeps each range’s formatting and leaves a caret after each', () => {
    const s = apply(allCats(), insertAtAll(allCats(), 'dog'))
    expect(texts(s)).toEqual(['dog category dog', 'dog'])
    expect(s.doc.child(1).firstChild?.marks.map((m) => m.type.name)).toEqual(['bold'])
    expect(ranges(s.selection)).toEqual([[4, 4], [17, 17], [22, 22]])
  })

  it('undoes the whole edit in one step', () => {
    const s = apply(allCats(), insertAtAll(allCats(), 'dog'))
    let undone = s
    undo(s, (tr) => (undone = s.apply(tr)))
    expect(texts(undone)).toEqual(['cat category cat', 'cat'])
  })

  it('Backspace and Delete work at every caret', () => {
    const typed = apply(allCats(), insertAtAll(allCats(), 'dog'))
    expect(texts(apply(typed, deleteAtAll(typed, { forward: false })))).toEqual(['do category do', 'do'])
    const back = apply(typed, collapseToMain(typed))
    expect(back.selection).toBeInstanceOf(TextSelection)
  })

  it('a caret at the start of a block stays put instead of merging blocks', () => {
    const atStarts = stateAt(1).apply(stateAt(1).tr.setSelection(new MultiSelection([stateAt(1).selection.ranges[0], stateAt(19).selection.ranges[0]])))
    expect(texts(apply(atStarts, deleteAtAll(atStarts, { forward: false })))).toEqual(['cat category cat', 'cat'])
  })

  it('deletes an emoji as one character', () => {
    const d = doc(p(text('a😀')), p(text('b😀')))
    const s0 = stateAt(4, 4, d)
    const both = s0.apply(s0.tr.setSelection(new MultiSelection([s0.selection.ranges[0], stateAt(9, 9, d).selection.ranges[0]])))
    expect(texts(apply(both, deleteAtAll(both, { forward: false })))).toEqual(['a', 'b'])
  })

  it('any other change to the note ends the multi-selection', () => {
    const s = allCats().apply(allCats().tr.insertText('!', 13))
    expect(s.selection).toBeInstanceOf(TextSelection)
  })

  it('copies every selected piece, one per line', () => {
    const sel = allCats().selection
    expect(sel.content().content.textBetween(0, sel.content().content.size, '\n')).toEqual('cat\ncat\ncat')
  })
})
