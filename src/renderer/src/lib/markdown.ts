import type { JSONContent } from '@tiptap/react'

function inline(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n'
      if (n.type !== 'text') return inline(n.content)
      let t = n.text ?? ''
      const marks = n.marks ?? []
      const has = (type: string): boolean => marks.some((m) => m.type === type)
      if (has('code')) return '`' + t + '`'
      if (has('bold')) t = `**${t}**`
      if (has('italic')) t = `*${t}*`
      if (has('strike')) t = `~~${t}~~`
      const link = marks.find((m) => m.type === 'link')
      if (link) t = `[${t}](${link.attrs?.href ?? ''})`
      return t
    })
    .join('')
}

function cellText(cell: JSONContent): string {
  return (cell.content ?? [])
    .map((p) => inline(p.content))
    .join(' ')
    .replace(/\|/g, '\\|')
}

function listItems(node: JSONContent, indent: string, marker: (i: number, item: JSONContent) => string): string {
  return (node.content ?? [])
    .map((item, i) => {
      const prefix = marker(i, item)
      const [first, ...rest] = item.content ?? []
      const head = indent + prefix + (first ? block(first, '').trim() : '')
      const pad = indent + ' '.repeat(prefix.length)
      const tail = rest.map((child) => block(child, pad)).filter(Boolean)
      return [head, ...tail].join('\n')
    })
    .join('\n')
}

function block(node: JSONContent, indent = ''): string {
  switch (node.type) {
    case 'heading':
      return indent + '#'.repeat(node.attrs?.level ?? 1) + ' ' + inline(node.content)
    case 'paragraph':
      return indent + inline(node.content)
    case 'bulletList':
      return listItems(node, indent, () => '- ')
    case 'orderedList': {
      const start = node.attrs?.start ?? 1
      return listItems(node, indent, (i) => `${start + i}. `)
    }
    case 'taskList':
      return listItems(node, indent, (_i, item) => (item.attrs?.checked ? '- [x] ' : '- [ ] '))
    case 'blockquote':
      return (node.content ?? [])
        .map((c) => block(c))
        .join('\n\n')
        .split('\n')
        .map((l) => indent + '> ' + l)
        .join('\n')
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('')
      return `${indent}\`\`\`${node.attrs?.language ?? ''}\n${text}\n${indent}\`\`\``
    }
    case 'horizontalRule':
      return indent + '---'
    case 'table': {
      const rows = (node.content ?? []).map((r) => `| ${(r.content ?? []).map(cellText).join(' | ')} |`)
      const cols = node.content?.[0]?.content?.length ?? 1
      rows.splice(1, 0, `| ${Array(cols).fill('---').join(' | ')} |`)
      return rows.map((r) => indent + r).join('\n')
    }
    default:
      return node.content ? (node.content ?? []).map((c) => block(c, indent)).join('\n\n') : ''
  }
}

export function toMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((n) => block(n))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
