import { Extension } from '@tiptap/core'
import { Fragment, Slice, type Node } from '@tiptap/pm/model'
import { Plugin, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { MultiSelection } from './multiSelection'

const LIST_ITEMS = new Set(['listItem', 'taskItem'])
// Copying or pasting a range in these would move table structure around rather than lines of text.
const NOT_LINES = new Set(['table', 'tableRow'])

type CodeLines = { kind: 'code'; from: number; to: number; text: string }
type BlockLines = { kind: 'blocks'; from: number; to: number; content: Fragment; ownLineOnly: boolean }
type Lines = CodeLines | BlockLines

/** What a whole-line copy put on the clipboard; kept in memory so paste can tell it from ordinary text, as VS Code does. */
export type LineCopy = { text: string; content: Fragment | null }

// A copied heading must not stay folded, or it would hide whatever follows the copy.
const unfolded = (content: Fragment): Fragment => {
  const nodes: Node[] = []
  content.forEach((n) => nodes.push(n.type.name === 'heading' && n.attrs.collapsed ? n.type.create({ ...n.attrs, collapsed: false }, n.content, n.marks) : n))
  return Fragment.from(nodes)
}

/**
 * The lines the selection touches. In a list a line is the list item, so a copy becomes a new item; in a code block it is
 * one line of the code. A single list item with sub-items counts as its own line only, without the sub-items.
 */
function linesAt(state: EditorState): Lines | null {
  const { $from, $to } = state.selection
  if ($from.parent.type.name === 'codeBlock' && $from.sameParent($to)) {
    const start = $from.start()
    const text = $from.parent.textContent
    const lineStart = text.lastIndexOf('\n', $from.parentOffset - 1) + 1
    const nextBreak = text.indexOf('\n', $to.parentOffset)
    const lineEnd = nextBreak === -1 ? text.length : nextBreak
    return { kind: 'code', from: start + lineStart, to: start + lineEnd, text: text.slice(lineStart, lineEnd) }
  }
  const range = $from.blockRange($to, (node) => !LIST_ITEMS.has(node.type.name))
  if (!range || NOT_LINES.has(range.parent.type.name)) return null
  const nodes: Node[] = []
  for (let i = range.startIndex; i < range.endIndex; i++) nodes.push(range.parent.child(i))
  const only = nodes.length === 1 ? nodes[0] : null
  const ownLineOnly = !!only && LIST_ITEMS.has(only.type.name) && only.childCount > 1 && $to.pos <= range.start + 1 + only.firstChild!.nodeSize
  const content = ownLineOnly ? Fragment.from(only!.copy(Fragment.from(only!.firstChild!))) : Fragment.from(nodes)
  return { kind: 'blocks', from: range.start, to: range.end, content: unfolded(content), ownLineOnly }
}

const plainText = (content: Fragment): string => content.textBetween(0, content.size, '\n', (leaf) => (leaf.type.name === 'hardBreak' ? '\n' : ''))

/** Copy Line Down / Up: copies every line the selection touches below or above, and moves the selection onto the copy. */
export function copyLines(state: EditorState, direction: 'down' | 'up'): Transaction | null {
  const lines = linesAt(state)
  if (!lines) return null
  const { anchor, head } = state.selection
  const tr = state.tr
  let shift: number
  if (lines.kind === 'code') {
    const down = direction === 'down'
    tr.insertText(down ? `\n${lines.text}` : `${lines.text}\n`, down ? lines.to : lines.from)
    shift = down ? lines.text.length + 1 : 0
  } else {
    const at = direction === 'down' ? lines.to : lines.from
    tr.insert(at, lines.content)
    // The copy has the same shape as the original up to the end of the copied lines, so offsets carry across.
    shift = direction === 'down' ? at - lines.from : 0
  }
  const selection =
    state.selection instanceof TextSelection
      ? TextSelection.create(tr.doc, anchor + shift, head + shift)
      : Selection.near(tr.doc.resolve(anchor + shift))
  return tr.setSelection(selection).scrollIntoView()
}

/** Ctrl/Cmd+C with nothing selected: the whole line, ending in a newline like VS Code's copy. */
export function lineCopyAt(state: EditorState): LineCopy | null {
  if (!state.selection.empty || state.selection instanceof MultiSelection) return null
  const lines = linesAt(state)
  if (!lines) return null
  if (lines.kind === 'code') return { text: `${lines.text}\n`, content: null }
  return { text: `${plainText(lines.content)}\n`, content: lines.content }
}

/** Ctrl/Cmd+X with nothing selected removes the line. A list item with sub-items keeps its bullet so they stay put. */
export function cutLine(state: EditorState): Transaction | null {
  const lines = linesAt(state)
  if (!lines) return null
  const tr = state.tr
  if (lines.kind === 'code') {
    const text = state.selection.$from.parent.textContent
    const start = state.selection.$from.start()
    const atEnd = lines.to - start === text.length
    // The last line takes the newline before it; any other line takes the one after it.
    tr.delete(atEnd && lines.from > start ? lines.from - 1 : lines.from, atEnd ? lines.to : lines.to + 1)
    return tr
  }
  if (lines.ownLineOnly) {
    const item = state.doc.nodeAt(lines.from)!
    return tr.delete(lines.from + 2, lines.from + 1 + item.firstChild!.nodeSize - 1)
  }
  const parent = state.doc.resolve(lines.from).parent
  if (parent.type.name === 'doc' && lines.to - lines.from === parent.content.size) {
    return tr.replaceWith(0, parent.content.size, state.schema.nodes.paragraph.create())
  }
  tr.deleteRange(lines.from, lines.to)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(lines.from, tr.doc.content.size))))
}

/** Pasting a whole-line copy with nothing selected puts it above the cursor's line; the cursor stays on its line. */
export function pasteLines(state: EditorState, copy: LineCopy): Transaction | null {
  if (!state.selection.empty) return null
  const lines = linesAt(state)
  if (!lines) return null
  const tr = state.tr
  if (lines.kind === 'code') return tr.insertText(copy.text, lines.from)
  const content =
    copy.content ??
    Fragment.from(
      copy.text
        .replace(/\n$/, '')
        .split('\n')
        .map((t) => state.schema.nodes.paragraph.create(null, t ? state.schema.text(t) : null))
    )
  return tr.replace(lines.from, lines.from, new Slice(content, 0, 0))
}

let lastLineCopy: LineCopy | null = null

const normalise = (text: string): string => text.replace(/\r\n/g, '\n')

function lineClipboardPlugin(): Plugin {
  const write = (cut: boolean) => (view: EditorView, event: ClipboardEvent): boolean => {
    const copy = event.clipboardData ? lineCopyAt(view.state) : null
    if (!copy) return false
    event.preventDefault()
    const html = copy.content ? view.serializeForClipboard(new Slice(copy.content, 0, 0)).dom.innerHTML : ''
    event.clipboardData!.clearData()
    if (html) event.clipboardData!.setData('text/html', html)
    event.clipboardData!.setData('text/plain', copy.text)
    lastLineCopy = copy
    const tr = cut ? cutLine(view.state) : null
    if (tr) view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'cut'))
    return true
  }
  return new Plugin({
    props: {
      handleDOMEvents: { copy: write(false), cut: write(true) },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain')
        // Windows hands plain text back with \r\n line endings.
        if (!lastLineCopy || text === undefined || normalise(text) !== lastLineCopy.text) return false
        const tr = pasteLines(view.state, lastLineCopy)
        if (!tr) return false
        view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'paste'))
        return true
      }
    }
  })
}

export const LineClipboard = Extension.create({
  name: 'lineClipboard',
  addProseMirrorPlugins: () => [lineClipboardPlugin()]
})
