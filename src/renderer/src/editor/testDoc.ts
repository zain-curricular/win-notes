import { getSchema, type JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { buildExtensions } from './extensions'

// Test helper: documents built with the editor's real schema.
export const schema = getSchema(buildExtensions())

export const text = (t: string, ...marks: string[]): JSONContent => ({ type: 'text', text: t, marks: marks.map((type) => ({ type })) })
export const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
export const h = (level: number, t: string, { collapsed = false } = {}): JSONContent => ({
  type: 'heading',
  attrs: { level, collapsed },
  content: [text(t)]
})
export const br: JSONContent = { type: 'hardBreak' }
export const doc = (...content: JSONContent[]): Node => schema.nodeFromJSON({ type: 'doc', content })
