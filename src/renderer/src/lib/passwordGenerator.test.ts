import { describe, expect, it } from 'vitest'
import { DEFAULT_GENERATOR, generatePassword, randomIndex } from './passwordGenerator'

describe('password generator', () => {
  it('uses the requested length and only the chosen kinds, with at least one of each', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ length: 12, lower: true, upper: false, digits: true, symbols: false })
      expect(pw).toMatch(/^[a-z0-9]{12}$/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[0-9]/)
    }
  })

  it('keeps the length between 8 and 64', () => {
    expect(generatePassword({ ...DEFAULT_GENERATOR, length: 3 })).toHaveLength(8)
    expect(generatePassword({ ...DEFAULT_GENERATOR, length: 500 })).toHaveLength(64)
  })

  it('refuses when no kind of character is chosen', () => {
    expect(() => generatePassword({ length: 20, lower: false, upper: false, digits: false, symbols: false })).toThrow()
  })

  // 2^32 - 1 is the one value past the last whole block of 3, so taking it modulo 3 would favour index 0.
  it('draws again instead of using a value that would bias the result', () => {
    const values = [0xffffffff, 7]
    expect(randomIndex(3, () => new Uint32Array([values.shift()!]))).toBe(1)
  })
})
