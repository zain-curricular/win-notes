import type { Node } from '@tiptap/pm/model'

export type TextRange = { from: number; to: number }

/** Top-level blocks hidden under a collapsed heading, down to the next heading of the same or a higher level. */
export function foldedRanges(doc: Node): TextRange[] {
  const ranges: TextRange[] = []
  let hiddenBelow: number | null = null
  doc.forEach((node, offset) => {
    const isHeading = node.type.name === 'heading'
    if (isHeading && hiddenBelow !== null && node.attrs.level <= hiddenBelow) hiddenBelow = null
    if (hiddenBelow !== null) {
      ranges.push({ from: offset, to: offset + node.nodeSize })
      return
    }
    if (isHeading && node.attrs.collapsed) hiddenBelow = node.attrs.level
  })
  return ranges
}
