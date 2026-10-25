import type { JSONContent } from '@tiptap/react'
import { marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { toMarkdown } from './markdown'
import { convertBoxTables } from './paste'

const bodyCells = (md: string): string[] => [...marked.parse(md, { async: false }).matchAll(/<td>(.*?)<\/td>/g)].map((m) => m[1])

const cell = (text: string): JSONContent => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const tableOf = (texts: string[]): JSONContent => ({
  type: 'doc',
  content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell('h1'), cell('h2')] }, { type: 'tableRow', content: texts.map(cell) }] }]
})

describe('table cells keep backslashes and pipes', () => {
  it.each([
    ['a|b', 'a|b'],
    ['a\\|b', 'a\\|b'],
    ['C:\\path', 'C:\\path'],
    ['\\\\|', '\\\\|']
  ])('Copy as Markdown: %s', (text, expected) => {
    expect(bodyCells(toMarkdown(tableOf([text, 'end'])))).toEqual([expected, 'end'])
  })

  it('pasted box table', () => {
    const box = ['┌────┬─────┐', '│ h1 │ h2  │', '├────┼─────┤', '│ a\\|b │ end │', '└────┴─────┘'].join('\n')
    expect(bodyCells(convertBoxTables(box))).toEqual(['a\\|b', 'end'])
  })
})
