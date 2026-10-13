import type { Editor } from '@tiptap/react'

export type BlockStyle = 'title' | 'heading' | 'subheading' | 'body' | 'mono'
export type ListKind = 'bullet' | 'dashed' | 'ordered' | 'task'
export type HighlightColor = 'purple' | 'pink' | 'orange' | 'mint' | 'blue'

export const HIGHLIGHT_COLORS: HighlightColor[] = ['purple', 'pink', 'orange', 'mint', 'blue']

export function currentStyle(editor: Editor): BlockStyle {
  if (editor.isActive('heading', { level: 1 })) return 'title'
  if (editor.isActive('heading', { level: 2 })) return 'heading'
  if (editor.isActive('heading', { level: 3 })) return 'subheading'
  if (editor.isActive('codeBlock')) return 'mono'
  return 'body'
}

export function setStyle(editor: Editor, style: BlockStyle): boolean {
  const chain = editor.chain().focus()
  switch (style) {
    case 'title':
      return chain.setNode('heading', { level: 1 }).run()
    case 'heading':
      return chain.setNode('heading', { level: 2 }).run()
    case 'subheading':
      return chain.setNode('heading', { level: 3 }).run()
    case 'mono':
      return editor.isActive('codeBlock') ? chain.setParagraph().run() : chain.setCodeBlock().run()
    default:
      return chain.setParagraph().run()
  }
}

export function currentList(editor: Editor): ListKind | null {
  if (editor.isActive('taskList')) return 'task'
  if (editor.isActive('orderedList')) return 'ordered'
  if (editor.isActive('bulletList', { dashed: true })) return 'dashed'
  if (editor.isActive('bulletList')) return 'bullet'
  return null
}

export function toggleList(editor: Editor, kind: ListKind): boolean {
  const chain = editor.chain().focus()
  const active = currentList(editor)
  switch (kind) {
    case 'task':
      return chain.toggleTaskList().run()
    case 'ordered':
      return chain.toggleOrderedList().run()
    case 'dashed':
      if (active === 'dashed') return chain.toggleBulletList().run()
      if (active === 'bullet') return chain.updateAttributes('bulletList', { dashed: true }).run()
      return chain.toggleBulletList().updateAttributes('bulletList', { dashed: true }).run()
    case 'bullet':
      if (active === 'dashed') return chain.updateAttributes('bulletList', { dashed: false }).run()
      return chain.toggleBulletList().run()
  }
}

export function toggleChecked(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'taskItem') {
      const pos = $from.before(d)
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
      return true
    }
  }
  return false
}

export function currentHighlight(editor: Editor): HighlightColor | null {
  return HIGHLIGHT_COLORS.find((c) => editor.isActive('highlight', { color: c })) ?? null
}

export function setHighlight(editor: Editor, color: HighlightColor | null): boolean {
  const chain = editor.chain().focus()
  return color ? chain.setHighlight({ color }).run() : chain.unsetHighlight().run()
}

export function insertTable(editor: Editor): boolean {
  return editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()
}
