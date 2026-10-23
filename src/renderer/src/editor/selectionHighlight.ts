import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findOccurrences } from './occurrences'

const MAX_SELECTION = 200
const key = new PluginKey<DecorationSet>('selectionMatches')

function matchDecorations(state: EditorState): DecorationSet {
  const { doc, selection } = state
  const { $from, $to } = selection.ranges[0]
  if ($from.pos === $to.pos || !$from.sameParent($to) || !$from.parent.isTextblock) return DecorationSet.empty
  const needle = doc.textBetween($from.pos, $to.pos, undefined, '￼')
  if (needle.length > MAX_SELECTION || !/\S/.test(needle)) return DecorationSet.empty
  const selected = new Set(selection.ranges.map((r) => r.$from.pos))
  const decorations = findOccurrences(doc, needle)
    .filter((r) => !selected.has(r.from))
    .map((r) => Decoration.inline(r.from, r.to, { class: 'selection-match' }))
  return DecorationSet.create(doc, decorations)
}

/** Boxes the other copies of the selected text, like VS Code. View-only: nothing is written to the note. */
export function selectionMatchesPlugin(): Plugin<DecorationSet> {
  return new Plugin({
    key,
    state: {
      init: (_, state) => matchDecorations(state),
      apply: (tr, old, oldState, newState) =>
        tr.docChanged || !oldState.selection.eq(newState.selection) ? matchDecorations(newState) : old
    },
    props: { decorations: (state) => key.getState(state) }
  })
}

export const SelectionMatches = Extension.create({
  name: 'selectionMatches',
  addProseMirrorPlugins: () => [selectionMatchesPlugin()]
})
