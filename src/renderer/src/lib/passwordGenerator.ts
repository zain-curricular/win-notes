export type GeneratorOptions = { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean }

export const DEFAULT_GENERATOR: GeneratorOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true }
export const MIN_LENGTH = 8
export const MAX_LENGTH = 64

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~.,:;'
} as const

type RandomWords = (count: number) => Uint32Array
const cryptoWords: RandomWords = (count) => crypto.getRandomValues(new Uint32Array(count))

/** A uniform index below n. Values in the last partial block of 2^32 are drawn again, so no index is favoured. */
export function randomIndex(n: number, words: RandomWords = cryptoWords): number {
  const limit = 2 ** 32 - (2 ** 32 % n)
  for (;;) {
    const [v] = words(1)
    if (v < limit) return v % n
  }
}

export function generatePassword(options: GeneratorOptions, words: RandomWords = cryptoWords): string {
  const chosen = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => options[k]).map((k) => SETS[k])
  if (!chosen.length) throw new Error('Choose at least one kind of character.')
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(options.length)))
  const all = chosen.join('')
  const pick = (set: string): string => set[randomIndex(set.length, words)]
  const chars = [...chosen.map(pick), ...Array.from({ length: length - chosen.length }, () => pick(all))]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, words)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
