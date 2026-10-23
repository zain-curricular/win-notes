import { describe, expect, it } from 'vitest'
import { stepZoom } from './zoom'

describe('zoom steps', () => {
  it('moves one browser step at a time', () => {
    expect([stepZoom(1, 1), stepZoom(1.1, 1), stepZoom(1, -1), stepZoom(0.9, -1)]).toEqual([1.1, 1.25, 0.9, 0.8])
  })

  it('stops at 50% and 200%', () => {
    expect([stepZoom(0.5, -1), stepZoom(2, 1)]).toEqual([0.5, 2])
  })

  it('snaps a level between steps to the next one', () => {
    expect([stepZoom(1.3, 1), stepZoom(1.3, -1)]).toEqual([1.5, 1.25])
  })
})
