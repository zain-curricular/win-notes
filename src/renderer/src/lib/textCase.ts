export type CaseFormat =
  | 'upper'
  | 'lower'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'screamingSnake'
  | 'kebab'
  | 'screamingKebab'
  | 'dot'
  | 'path'
  | 'toggle'

/** A piece of converted text and the index of the source character it came from, so formatting can follow it. */
export type Piece = { src: number; text: string }

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const MARK = /\p{M}/u
const UPPER = /[\p{Lu}\p{Lt}]/u
const LOWER = /\p{Ll}/u
const DIGIT = /\p{N}/u
const APOSTROPHE = /['’]/
const SENTENCE_END = /[.!?]/
const CONNECTOR = /[_\-./'’]/

const JOINED: Partial<Record<CaseFormat, { joiner: string; words: 'lower' | 'upper' | 'camel' | 'capital' }>> = {
  camel: { joiner: '', words: 'camel' },
  pascal: { joiner: '', words: 'capital' },
  snake: { joiner: '_', words: 'lower' },
  screamingSnake: { joiner: '_', words: 'upper' },
  kebab: { joiner: '-', words: 'lower' },
  screamingKebab: { joiner: '-', words: 'upper' },
  dot: { joiner: '.', words: 'lower' },
  path: { joiner: '/', words: 'lower' }
}

type Char = { src: number; ch: string }

const charsOf = (text: string, offset: number): Char[] => {
  const chars: Char[] = []
  let i = 0
  for (const ch of text) {
    chars.push({ src: offset + i, ch })
    i += ch.length
  }
  return chars
}

const isCore = (ch: string | undefined): boolean => !!ch && (LETTER_OR_DIGIT.test(ch) || MARK.test(ch))

// toUpperCase/toLowerCase rather than the locale versions, so a note converts the same way on every computer.
function caseOnly(chars: Char[], format: CaseFormat): Piece[] {
  let inWord = false
  let sentenceStart = true
  let sentenceEnded = false
  return chars.map(({ src, ch }, i) => {
    const word = isCore(ch) || (inWord && APOSTROPHE.test(ch) && isCore(chars[i + 1]?.ch))
    let text = ch
    if (format === 'upper') text = ch.toUpperCase()
    else if (format === 'lower') text = ch.toLowerCase()
    else if (format === 'toggle') text = UPPER.test(ch) ? ch.toLowerCase() : LOWER.test(ch) ? ch.toUpperCase() : ch
    else if (format === 'title') text = word ? (inWord ? ch.toLowerCase() : ch.toUpperCase()) : ch
    else if (format === 'sentence') {
      if (LETTER_OR_DIGIT.test(ch)) {
        text = sentenceStart ? ch.toUpperCase() : ch.toLowerCase()
        sentenceStart = false
      }
      // "3.14" and "notes.txt" are not sentence ends; a stop followed by a space is.
      if (/\s/.test(ch) && sentenceEnded) sentenceStart = true
      sentenceEnded = SENTENCE_END.test(ch) || (sentenceEnded && /\s/.test(ch))
    }
    inWord = word
    return { src, text }
  })
}

/** Splits a line into words: at separators, lower-to-upper (myNote), and the end of an acronym (XMLParser). */
function splitWords(chars: Char[]): Char[][] {
  const words: Char[][] = []
  let word: Char[] = []
  const end = (): void => {
    if (word.length) words.push(word)
    word = []
  }
  chars.forEach((c, i) => {
    const next = chars[i + 1]?.ch
    if (MARK.test(c.ch) && word.length) return void word.push(c)
    if (!LETTER_OR_DIGIT.test(c.ch)) {
      if (word.length && APOSTROPHE.test(c.ch) && next && LETTER_OR_DIGIT.test(next)) return
      return end()
    }
    const prev = [...word].reverse().find((w) => !MARK.test(w.ch))?.ch
    if (prev && UPPER.test(c.ch) && (LOWER.test(prev) || DIGIT.test(prev) || (UPPER.test(prev) && next && LOWER.test(next)))) end()
    word.push(c)
  })
  end()
  return words
}

function joined(chars: Char[], { joiner, words: style }: { joiner: string; words: 'lower' | 'upper' | 'camel' | 'capital' }): Piece[] {
  const asIs = chars.map(({ src, ch }) => ({ src, text: ch }))
  let lead = 0
  while (lead < chars.length && /\s/.test(chars[lead].ch)) lead++
  let trail = chars.length
  while (trail > lead && /\s/.test(chars[trail - 1].ch)) trail--
  const words = splitWords(chars.slice(lead, trail))
  // A line of only punctuation would come out empty; leave it alone rather than delete it.
  if (!words.length) return asIs
  const pieces = asIs.slice(0, lead)
  words.forEach((word, w) => {
    if (w > 0 && joiner) pieces.push({ src: word[0].src, text: joiner })
    const capital = style === 'capital' || (style === 'camel' && w > 0)
    word.forEach(({ src, ch }, i) => {
      const upper = style === 'upper' || (capital && i === 0)
      pieces.push({ src, text: upper ? ch.toUpperCase() : ch.toLowerCase() })
    })
  })
  return pieces.concat(asIs.slice(trail))
}

/** Converts each line of `text` on its own; `src` in each piece is a UTF-16 index into `text`. */
export function convertPieces(text: string, format: CaseFormat): Piece[] {
  const pieces: Piece[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    if (offset > 0) pieces.push({ src: offset - 1, text: '\n' })
    const chars = charsOf(line, offset)
    const join = JOINED[format]
    pieces.push(...(join ? joined(chars, join) : caseOnly(chars, format)))
    offset += line.length + 1
  }
  return pieces
}

export const convertCase = (text: string, format: CaseFormat): string =>
  convertPieces(text, format)
    .map((p) => p.text)
    .join('')

/** The word around `offset`; `_ - . / '` count as part of it between two letters or digits, so `my-var.name` is one word. */
export function wordAround(text: string, offset: number): { from: number; to: number } | null {
  const chars = charsOf(text, 0)
  const inWord = (i: number): boolean =>
    i >= 0 && i < chars.length && (isCore(chars[i].ch) || (CONNECTOR.test(chars[i].ch) && isCore(chars[i - 1]?.ch) && isCore(chars[i + 1]?.ch)))
  let at = chars.findIndex((c) => c.src >= offset)
  if (at === -1) at = chars.length
  let from = at
  let to = at
  while (inWord(from - 1)) from--
  while (inWord(to)) to++
  if (from === to) return null
  return { from: chars[from].src, to: to < chars.length ? chars[to].src : text.length }
}
