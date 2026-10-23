import { describe, expect, it } from 'vitest'
import { isNewer } from './version'

describe('update check', () => {
  it('compares each part as a number', () => {
    expect([isNewer('0.10.0', '0.9.1'), isNewer('0.2.0', '0.2.0'), isNewer('0.1.9', '0.2.0'), isNewer('1.0.0', '0.99.99')]).toEqual([true, false, false, true])
  })

  it('ignores pre-releases and anything that is not a version', () => {
    expect([isNewer('0.3.0-beta', '0.2.0'), isNewer('latest', '0.2.0')]).toEqual([false, false])
  })
})
