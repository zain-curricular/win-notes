import { describe, expect, it } from 'vitest'
import { convertCase, convertPieces, wordAround, type CaseFormat } from './textCase'

describe('convertCase', () => {
  it.each<[CaseFormat, string]>([
    ['upper', 'MY FIRST NOTE'],
    ['lower', 'my first note'],
    ['title', 'My First Note'],
    ['sentence', 'My first note'],
    ['camel', 'myFirstNote'],
    ['pascal', 'MyFirstNote'],
    ['snake', 'my_first_note'],
    ['screamingSnake', 'MY_FIRST_NOTE'],
    ['kebab', 'my-first-note'],
    ['screamingKebab', 'MY-FIRST-NOTE'],
    ['dot', 'my.first.note'],
    ['path', 'my/first/note'],
    ['toggle', 'mY FIRST nOTE']
  ])('%s', (format, expected) => {
    expect(convertCase('My first Note', format)).toBe(expected)
  })

  it('splits words at mixed case, acronyms, digits and every separator', () => {
    expect(convertCase('XMLHttpRequest v2Beta', 'snake')).toBe('xml_http_request_v2_beta')
    expect(convertCase('foo_bar-baz.qux/quux\tend', 'kebab')).toBe('foo-bar-baz-qux-quux-end')
    expect(convertCase('user_ID-2fa item2', 'camel')).toBe('userId2faItem2')
    expect(convertCase("Don't stop, believing!", 'snake')).toBe('dont_stop_believing')
  })

  it('converts each line on its own and keeps indentation, but leaves a line without words alone', () => {
    expect(convertCase('  first line\n\tsecond Line  ', 'camel')).toBe('  firstLine\n\tsecondLine  ')
    expect(convertCase('--- !!!\nreal words', 'snake')).toBe('--- !!!\nreal_words')
    expect(convertCase('one. two\nthree', 'sentence')).toBe('One. Two\nThree')
  })

  it('handles title and sentence boundaries', () => {
    expect(convertCase("hello-world don't STOP 2nd", 'title')).toBe("Hello-World Don't Stop 2nd")
    expect(convertCase('hello there. how ARE you?  fine.thanks pi is 3.14', 'sentence')).toBe('Hello there. How are you?  Fine.thanks pi is 3.14')
  })

  it('handles accents, other scripts and letters that change length, the same on every computer', () => {
    expect(convertCase('ÉCOLE Élève', 'lower')).toBe('école élève')
    expect(convertCase('straße', 'upper')).toBe('STRASSE')
    expect(convertCase('привет мир', 'camel')).toBe('приветМир')
    expect(convertCase('東京 tower', 'pascal')).toBe('東京Tower')
    expect(convertCase('Hello ÀB', 'toggle')).toBe('hELLO àb')
    expect(convertCase('İ', 'lower')).toBe('i̇')
    expect(convertCase('café noir', 'screamingSnake')).toBe('CAFÉ_NOIR')
  })

  it('returns empty text unchanged', () => {
    expect(convertCase('', 'camel')).toBe('')
    expect(convertCase('', 'title')).toBe('')
  })
})

describe('convertPieces', () => {
  it('points every piece, joiners included, at the source character it came from', () => {
    expect(convertPieces('ab cd', 'snake')).toEqual([
      { src: 0, text: 'a' },
      { src: 1, text: 'b' },
      { src: 3, text: '_' },
      { src: 3, text: 'c' },
      { src: 4, text: 'd' }
    ])
  })
})

describe('wordAround', () => {
  it('takes connected identifiers as one word, but not a stop at the end', () => {
    expect(wordAround('say my-var.name now', 6)).toEqual({ from: 4, to: 15 })
    expect(wordAround('the end.', 7)).toEqual({ from: 4, to: 7 })
    expect(wordAround('two  spaces', 4)).toBeNull()
  })
})
