import type { Node } from '@tiptap/pm/model'
import { foldedRanges, type TextRange } from './folds'

const WORD_CHAR = /[\p{L}\p{N}_]/u
export const isWordChar = (ch: string | undefined): boolean => !!ch && WORD_CHAR.test(ch)

/** The text of one block, with each inline node (a hard break) as one character so offsets equal positions. */
export const blockText = (block: Node): string => block.textBetween(0, block.content.size, undefined, '￼')

/** Every exact copy of `needle`, in document order. A copy never spans two blocks; folded sections are skipped. */
export function findOccurrences(doc: Node, needle: string, { wholeWord = false, limit = 1000 } = {}): TextRange[] {
  const found: TextRange[] = []
  if (!needle) return found
  const folded = foldedRanges(doc)
  doc.descendants((node, pos) => {
    if (found.length >= limit || folded.some((r) => pos >= r.from && pos < r.to)) return false
    if (!node.isTextblock) return true
    const text = blockText(node)
    for (let i = text.indexOf(needle); i !== -1 && found.length < limit; i = text.indexOf(needle, i + needle.length)) {
      if (wholeWord && (isWordChar(text[i - 1]) || isWordChar(text[i + needle.length]))) continue
      found.push({ from: pos + 1 + i, to: pos + 1 + i + needle.length })
    }
    return false
  })
  return found
}
