import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ useColorScheme: () => 'light' }))
const { dark, light } = await import('./theme')

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each([
  ['light', light],
  ['dark', dark]
])('%s Android theme contrast (WCAG AA)', (_name, t) => {
  it.each(['bg', 'grouped', 'card', 'sheet'] as const)('text colours are at least 4.5:1 on %s', (bg) => {
    for (const fg of ['text', 'text2', 'text3', 'accentText', 'danger'] as const) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the sign-in button text is at least 4.5:1 on the accent', () => {
    expect(contrast('#1d1d1f', t.accent)).toBeGreaterThanOrEqual(4.5)
  })
})
