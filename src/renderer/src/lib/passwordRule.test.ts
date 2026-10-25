import { describe, expect, it } from 'vitest'
import * as desktop from './passwordRule'
import * as mobile from '../../../../mobile/src/lib/passwordRule'

describe.each([
  ['desktop', desktop],
  ['Android', mobile]
])('%s sign-up password rule', (_name, rule) => {
  it.each([
    ['Abcdefg1', true],
    ['Abcdef1', false],
    ['abcdefg1', false],
    ['ABCDEFG1', false],
    ['Abcdefgh', false]
  ])('%s → %s', (password, ok) => {
    expect(rule.meetsSignUpRule(password)).toBe(ok)
  })
})
