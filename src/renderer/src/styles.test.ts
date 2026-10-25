import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))))
const darkStart = css.indexOf(":root:not([data-theme='light']) {")
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf('}', darkStart))) }

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each([
  ['light', light],
  ['dark', dark]
])('%s theme contrast (WCAG AA)', (_name, t) => {
  it.each(['--bg', '--bg-2', '--surface'])('text tokens are at least 4.5:1 on %s', (bg) => {
    for (const fg of ['--text', '--text-2', '--text-3', '--accent-text', '--danger']) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the focus ring is at least 3:1 against the backgrounds it sits on', () => {
    for (const bg of ['--bg', '--bg-2', '--surface']) expect(contrast(t['--ring'], t[bg]), `--ring on ${bg}`).toBeGreaterThanOrEqual(3)
  })

  it('text on the accent fill is at least 4.5:1', () => {
    expect(contrast(t['--on-accent'], t['--accent-fill'])).toBeGreaterThanOrEqual(4.5)
  })
})
