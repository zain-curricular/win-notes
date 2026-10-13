import { marked } from 'marked'

// Box-drawing tables, as printed by Claude Code and other terminal apps.
const BORDER = /^[┌├└╭╰┏┣┗╔╠╚┡┢╞╟+][─━═┬┼┴┳╋┻╤╪╧╦╬╩+\-:\s┐┤┘╮╯┓┫┛╗╣╝┩┪╡╢]*$/
const ROW = /^[│┃║]/
const CELL_SPLIT = /[│┃║]/

function isBoxLine(line: string): boolean {
  const t = line.trim()
  return t.length > 1 && (ROW.test(t) || (BORDER.test(t) && /[─━═]/.test(t)))
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^[│┃║]/, '')
    .replace(/[│┃║]$/, '')
    .split(CELL_SPLIT)
    .map((c) => c.trim())
}

const escapeCell = (c: string): string => c.replace(/\|/g, '\\|')

function boxBlockToMarkdown(block: string[]): string | null {
  // Group text lines into rows, splitting at interior border lines.
  const groups: string[][][] = []
  let current: string[][] = []
  let interiorBorders = 0
  block.forEach((line, i) => {
    const t = line.trim()
    if (ROW.test(t)) {
      current.push(splitCells(t))
      return
    }
    if (current.length) groups.push(current)
    current = []
    if (i > 0 && i < block.length - 1) interiorBorders++
  })
  if (current.length) groups.push(current)
  if (!groups.length) return null

  const cols = Math.max(...groups.flat().map((r) => r.length))
  const merge = (lines: string[][]): string[] =>
    Array.from({ length: cols }, (_, j) =>
      lines
        .map((l) => l[j] ?? '')
        .filter(Boolean)
        .join(' ')
    )

  let rows: string[][]
  if (interiorBorders > 1) {
    // Borders between every row: each group is one row, wrapped over several lines.
    rows = groups.map(merge)
  } else {
    // Only a border under the header: a line with an empty first cell continues the row above.
    rows = []
    groups.forEach((g, gi) => {
      if (gi === 0) {
        rows.push(merge(g))
        return
      }
      let pending: string[][] = []
      for (const line of g) {
        if (pending.length && !line[0]) pending.push(line)
        else {
          if (pending.length) rows.push(merge(pending))
          pending = [line]
        }
      }
      if (pending.length) rows.push(merge(pending))
    })
  }

  const [header, ...body] = rows
  const fmt = (r: string[]): string => `| ${r.map(escapeCell).join(' | ')} |`
  return [fmt(header), `| ${header.map(() => '---').join(' | ')} |`, ...body.map(fmt)].join('\n')
}

export function hasBoxTable(text: string): boolean {
  return text.split(/\r?\n/).filter((l) => ROW.test(l.trim())).length >= 2
}

/** Replaces terminal box tables with Markdown tables, leaving other text untouched. */
export function convertBoxTables(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    if (!isBoxLine(lines[i])) {
      out.push(lines[i++])
      continue
    }
    const block: string[] = []
    while (i < lines.length && isBoxLine(lines[i])) block.push(lines[i++])
    const md = block.filter((l) => ROW.test(l.trim())).length ? boxBlockToMarkdown(block) : null
    if (md) out.push('', md, '')
    else out.push(...block)
  }
  return out.join('\n')
}

const MARKDOWN_HINTS = [
  /^\s{0,3}#{1,6}\s+\S/m, // headings
  /^\s*\|.*\|\s*$/m, // table rows
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // task lists
  /^\s*[-*+]\s+\S/m, // bullets
  /^\s*\d+[.)]\s+\S/m, // numbered
  /^\s*```/m, // code fences
  /^\s*>\s+\S/m, // quotes
  /\*\*[^*\n]+\*\*/, // bold
  /`[^`\n]+`/, // inline code
  /\[[^\]\n]+\]\([^)\s]+\)/ // links
]

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_HINTS.some((re) => re.test(text))
}

/** Cleans up HTML so it maps onto the note's styles (used for both HTML and converted Markdown). */
export function normalizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // macOS Notes has three heading styles; fold deeper headings into Subheading.
  doc.querySelectorAll('h4, h5, h6').forEach((h) => {
    const h3 = doc.createElement('h3')
    h3.innerHTML = h.innerHTML
    h.replaceWith(h3)
  })
  // GitHub-style task lists become checklists.
  doc.querySelectorAll('ul').forEach((ul) => {
    const items = Array.from(ul.children).filter((c) => c.tagName === 'LI')
    if (!items.length || !items.every((li) => li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]')))
      return
    ul.setAttribute('data-type', 'taskList')
    items.forEach((li) => {
      const box = li.querySelector('input[type=checkbox]') as HTMLInputElement
      li.setAttribute('data-type', 'taskItem')
      li.setAttribute('data-checked', box.checked || box.hasAttribute('checked') ? 'true' : 'false')
      box.remove()
    })
  })
  // Images are not stored in notes yet; keep their alt text instead of dropping silently.
  doc.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt')
    img.replaceWith(alt ? doc.createTextNode(alt) : doc.createTextNode(''))
  })
  return doc.body.innerHTML
}

/** Converts pasted plain text to rich HTML when it contains Markdown or box tables; null to paste as-is. */
export function plainTextToHtml(text: string): string | null {
  const withTables = convertBoxTables(text)
  if (!looksLikeMarkdown(withTables)) return null
  const html = marked.parse(withTables, { gfm: true, breaks: false, async: false }) as string
  return normalizeHtml(html)
}
