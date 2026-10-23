import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { findOccurrences } from './occurrences'
import { selectionMatchesPlugin } from './selectionHighlight'
import { br, doc, h, p, text } from './testDoc'

// Positions: "Notes" 0-7, first paragraph text from 8, bold paragraph from 26, hard-break paragraph from 31,
// folded heading at 37, hidden paragraph from 46.
const note = (collapsed: boolean) =>
  doc(h(1, 'Notes'), p(text('cat category cat')), p(text('ca', 'bold'), text('t')), p(text('a'), br, text('cat')), h(2, 'Folded', { collapsed }), p(text('cat hidden')))

describe('findOccurrences', () => {
  it('finds copies across marks and after hard breaks, skipping folded sections', () => {
    expect(findOccurrences(note(true), 'cat')).toEqual([
      { from: 8, to: 11 },
      { from: 12, to: 15 },
      { from: 21, to: 24 },
      { from: 26, to: 29 },
      { from: 33, to: 36 }
    ])
  })

  it('includes the section once it is unfolded', () => {
    expect(findOccurrences(note(false), 'cat').at(-1)).toEqual({ from: 46, to: 49 })
  })

  it('whole words skip copies inside longer words', () => {
    expect(findOccurrences(note(true), 'cat', { wholeWord: true }).map((r) => r.from)).toEqual([8, 21, 26, 33])
  })

  it('never matches across two blocks', () => {
    expect(findOccurrences(note(true), 'catca')).toEqual([])
  })

  it('stops at the limit', () => {
    expect(findOccurrences(note(true), 'cat', { limit: 2 })).toEqual([
      { from: 8, to: 11 },
      { from: 12, to: 15 }
    ])
  })
})

describe('selection highlight', () => {
  const boxes = (from: number, to: number, d = note(true)): number[] => {
    const plugin = selectionMatchesPlugin()
    const state = EditorState.create({ doc: d, plugins: [plugin], selection: TextSelection.create(d, from, to) })
    return (plugin.getState(state)?.find() ?? []).map((deco) => deco.from)
  }

  it('boxes every other copy of the selected text', () => {
    expect(boxes(8, 11)).toEqual([12, 21, 26, 33])
  })

  it('ignores blank selections, selections across blocks and an empty cursor', () => {
    expect(boxes(11, 12)).toEqual([])
    expect(boxes(20, 28)).toEqual([])
    expect(boxes(8, 8)).toEqual([])
  })

  it('ignores selections longer than 200 characters', () => {
    const long = doc(p(text('x'.repeat(201))), p(text('x'.repeat(201))))
    expect(boxes(1, 202, long)).toEqual([])
  })
})
