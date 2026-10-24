import { expect, it } from 'vitest'
import { isOpenableLink } from './links'

it('opens web and mail links from a note, and nothing that starts another app', () => {
  expect(['https://example.com', 'HTTP://example.com', 'mailto:a@b.co'].map(isOpenableLink)).toEqual([true, true, true])
  expect(['tel:123', 'sms:123', 'intent://scan#Intent;scheme=zxing;end', 'file:///sdcard/x', 'javascript:alert(1)'].map(isOpenableLink)).toEqual([
    false,
    false,
    false,
    false,
    false
  ])
})
