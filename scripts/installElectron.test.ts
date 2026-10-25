import { describe, expect, it } from 'vitest'
import { withRetries } from './install-electron.mjs'

const attempts = (results: boolean[]) => {
  const calls: number[] = []
  return { calls, attempt: async () => (calls.push(calls.length), results[calls.length - 1] ?? false) }
}

describe('Electron download retries', () => {
  it('succeeds on the third try after two dropped downloads', async () => {
    const waits: number[] = []
    const { calls, attempt } = attempts([false, false, true])
    expect(await withRetries(attempt, [5000, 20000], async (ms) => void waits.push(ms))).toBe(true)
    expect(calls).toHaveLength(3)
    expect(waits).toEqual([5000, 20000])
  })

  it('gives up after three failures', async () => {
    const { calls, attempt } = attempts([false, false, false, true])
    expect(await withRetries(attempt, [5000, 20000], async () => {})).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('does not wait when the first try works', async () => {
    const waits: number[] = []
    expect(await withRetries(attempts([true]).attempt, [5000, 20000], async (ms) => void waits.push(ms))).toBe(true)
    expect(waits).toEqual([])
  })
})
