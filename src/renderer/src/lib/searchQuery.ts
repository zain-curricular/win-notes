export type SearchOptions = { matchCase: boolean; wholeWord: boolean; regex: boolean }
export type Matcher = { ok: true; test: (text: string) => boolean } | { ok: false; error: string }

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false, regex: false }

// \b only knows ASCII letters, so word edges are spelled out to cover Urdu, Arabic and accented text.
const UNICODE_WORD = '[\\p{L}\\p{N}_]'
const ASCII_WORD = '\\w'

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wholeWord = (source: string, word: string): string => `(?<!${word})(?:${source})(?!${word})`

/** Compiles a search once so it can be run against every note. Never throws on a bad pattern. */
export function buildMatcher(query: string, options: SearchOptions): Matcher {
  if (!options.regex) {
    const terms = query.split(/\s+/).filter(Boolean)
    if (!options.wholeWord) {
      if (options.matchCase) return { ok: true, test: (text) => terms.every((t) => text.includes(t)) }
      const lower = terms.map((t) => t.toLowerCase())
      return {
        ok: true,
        test: (text) => {
          const hay = text.toLowerCase()
          return lower.every((t) => hay.includes(t))
        }
      }
    }
    const patterns = terms.map((t) => new RegExp(wholeWord(escapeRegExp(t), UNICODE_WORD), options.matchCase ? 'u' : 'iu'))
    return { ok: true, test: (text) => patterns.every((p) => p.test(text)) }
  }
  const flags = options.matchCase ? 'm' : 'mi'
  try {
    const re = new RegExp(options.wholeWord ? wholeWord(query, UNICODE_WORD) : query, `${flags}u`)
    return { ok: true, test: (text) => re.test(text) }
  } catch {
    // Unicode mode rejects escapes such as \- that plain patterns accept.
  }
  try {
    const re = new RegExp(options.wholeWord ? wholeWord(query, ASCII_WORD) : query, flags)
    return { ok: true, test: (text) => re.test(text) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
