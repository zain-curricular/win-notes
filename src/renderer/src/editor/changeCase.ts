import { Fragment, Mark, type Node, type Schema } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { blockText } from './occurrences'
import { convertPieces, wordAround, type CaseFormat, type Piece } from '../lib/textCase'
import type { EditorShortcutId } from '../lib/shortcuts'

export const CASE_COMMANDS = [
  { id: 'caseUpper', format: 'upper' },
  { id: 'caseLower', format: 'lower' },
  { id: 'caseTitle', format: 'title' },
  { id: 'caseSentence', format: 'sentence' },
  { id: 'caseCamel', format: 'camel' },
  { id: 'casePascal', format: 'pascal' },
  { id: 'caseSnake', format: 'snake' },
  { id: 'caseScreamingSnake', format: 'screamingSnake' },
  { id: 'caseKebab', format: 'kebab' },
  { id: 'caseScreamingKebab', format: 'screamingKebab' },
  { id: 'caseDot', format: 'dot' },
  { id: 'casePath', format: 'path' },
  { id: 'caseToggle', format: 'toggle' }
] as const satisfies readonly { id: EditorShortcutId; format: CaseFormat }[]

export type CaseShortcutId = (typeof CASE_COMMANDS)[number]['id']

type Edit = { from: number; to: number; content: Fragment }

function textNodes(schema: Schema, pieces: Piece[], marksAt: readonly (readonly Mark[])[]): Fragment {
  const nodes: Node[] = []
  let text = ''
  let marks: readonly Mark[] = []
  for (const p of pieces) {
    if (!p.text) continue
    const m = marksAt[p.src]
    if (text && !Mark.sameSet(marks, m)) {
      nodes.push(schema.text(text, marks))
      text = ''
    }
    marks = m
    text += p.text
  }
  if (text) nodes.push(schema.text(text, marks))
  return Fragment.from(nodes)
}

/** Converts the text of [from, to) inside one textblock. Each run of text between hard breaks is converted on its own. */
function editsIn(block: Node, start: number, from: number, to: number, format: CaseFormat): Edit[] {
  const edits: Edit[] = []
  let run: { from: number; to: number; text: string; marks: (readonly Mark[])[] } | null = null
  const flush = (): void => {
    if (!run) return
    const pieces = convertPieces(run.text, format)
    if (pieces.map((p) => p.text).join('') !== run.text)
      edits.push({ from: run.from, to: run.to, content: textNodes(block.type.schema, pieces, run.marks) })
    run = null
  }
  block.forEach((child, offset) => {
    const a = Math.max(from, start + offset)
    const b = Math.min(to, start + offset + child.nodeSize)
    if (a >= b) return
    if (!child.isText) return flush()
    run ??= { from: a, to: a, text: '', marks: [] }
    const text = child.text!.slice(a - start - offset, b - start - offset)
    run.text += text
    run.to = b
    for (let i = 0; i < text.length; i++) run.marks.push(child.marks)
  })
  flush()
  return edits
}

const applyEdits = (state: EditorState, edits: Edit[]): Transaction => {
  const tr = state.tr
  for (const e of [...edits].sort((x, y) => y.from - x.from)) tr.replaceWith(e.from, e.to, e.content)
  return tr
}

/**
 * Converts every selected range, or the word at a bare cursor, in one transaction (one undo step).
 * Null when nothing would change, so no empty step lands on the undo history.
 */
export function changeCase(state: EditorState, format: CaseFormat): Transaction | null {
  const { selection, doc } = state
  if (selection.empty) {
    const { $from } = selection
    if (!$from.parent.isTextblock) return null
    const word = wordAround(blockText($from.parent), $from.parentOffset)
    if (!word) return null
    const start = $from.start()
    const edits = editsIn($from.parent, start, start + word.from, start + word.to, format)
    if (!edits.length) return null
    const tr = applyEdits(state, edits)
    const end = tr.mapping.map(start + word.to)
    return tr.setSelection(TextSelection.create(tr.doc, Math.min($from.pos, end)))
  }
  const edits: Edit[] = []
  for (const { $from, $to } of selection.ranges) {
    doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true
      edits.push(...editsIn(node, pos + 1, $from.pos, $to.pos, format))
      return false
    })
  }
  if (!edits.length) return null
  const tr = applyEdits(state, edits)
  // A range edge sits on an edit's start or end, which mapping keeps on the start or end of the new text.
  return tr.setSelection(selection.map(tr.doc, tr.mapping))
}
