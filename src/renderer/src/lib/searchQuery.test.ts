import { describe, expect, it } from 'vitest'
import { buildMatcher, DEFAULT_SEARCH_OPTIONS, type SearchOptions } from './searchQuery'

const NOTES: Record<string, string> = {
  plain: 'Shopping list\nbuy cat food',
  category: 'Ideas\nnew category for the blog',
  upper: 'CAT pictures\nfrom the weekend',
  urdu: 'سفر\nکتاب اور کتابیں',
  lines: 'Groceries\nmilk\neggs',
  dash: 'Dates\nmeeting 2026-10-22'
}

function found(query: string, options: Partial<SearchOptions> = {}): string[] {
  const m = buildMatcher(query, { ...DEFAULT_SEARCH_OPTIONS, ...options })
  if (!m.ok) throw new Error(m.error)
  return Object.keys(NOTES).filter((id) => m.test(NOTES[id]))
}

describe('search with every option off', () => {
  it('ignores case and needs every word, in any order', () => {
    expect(found('cat')).toEqual(['plain', 'category', 'upper'])
    expect(found('food CAT')).toEqual(['plain'])
    expect(found('  ')).toEqual(['plain', 'category', 'upper', 'urdu', 'lines', 'dash'])
  })

  it('treats regex characters as text', () => {
    expect(found('2026-10')).toEqual(['dash'])
    expect(found('.*')).toEqual([])
  })
})

describe('search options', () => {
  it('Match Case keeps capitals', () => {
    expect(found('cat', { matchCase: true })).toEqual(['plain', 'category'])
    expect(found('CAT', { matchCase: true })).toEqual(['upper'])
  })

  it('Match Whole Word skips words that only contain the term', () => {
    expect(found('cat', { wholeWord: true })).toEqual(['plain', 'upper'])
    expect(found('cat', { wholeWord: true, matchCase: true })).toEqual(['plain'])
  })

  it('Match Whole Word uses Unicode word edges', () => {
    expect(found('کتاب', { wholeWord: true })).toEqual(['urdu'])
    expect(found('کتا', { wholeWord: true })).toEqual([])
  })

  it('Regex is one pattern, with ^ and $ at each line', () => {
    expect(found('cat (food|pictures)', { regex: true })).toEqual(['plain', 'upper'])
    expect(found('^milk$', { regex: true })).toEqual(['lines'])
    expect(found('^cat', { regex: true })).toEqual(['upper'])
    expect(found('^cat', { regex: true, matchCase: true })).toEqual([])
    expect(found('cat', { regex: true, wholeWord: true })).toEqual(['plain', 'upper'])
  })

  it('Regex accepts escapes that Unicode mode rejects', () => {
    expect(found('2026\\-10', { regex: true })).toEqual(['dash'])
  })

  it('reports an invalid pattern instead of throwing', () => {
    const m = buildMatcher('cat(', { ...DEFAULT_SEARCH_OPTIONS, regex: true })
    expect(m.ok).toBe(false)
  })
})
