// The note editor page the mobile app shows inside a WebView. It runs the same TipTap extensions
// as the desktop app, so documents stay identical across devices, and talks to React Native with
// JSON messages (see mobile/src/editor/bridge.ts for the other side).
import { Editor, type JSONContent } from '@tiptap/core'
import type { Editor as ReactEditor } from '@tiptap/react'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { Selection, TextSelection } from '@tiptap/pm/state'
import { buildExtensions } from '../src/renderer/src/editor/extensions'
import {
  currentHighlight,
  currentList,
  currentStyle,
  insertTable,
  setHighlight,
  setStyle,
  toggleChecked,
  toggleList,
  type BlockStyle,
  type HighlightColor,
  type ListKind
} from '../src/renderer/src/editor/commands'
import { hasBoxTable, normalizeHtml, plainTextToHtml } from '../src/renderer/src/lib/paste'
import { toMarkdown } from '../src/renderer/src/lib/markdown'
import './editor.css'

type Incoming =
  | { type: 'load'; content: JSONContent; editable: boolean; theme: 'light' | 'dark'; date: string; focus?: boolean }
  | { type: 'remote'; content: JSONContent }
  | { type: 'editable'; editable: boolean }
  | { type: 'theme'; theme: 'light' | 'dark' }
  | { type: 'date'; date: string }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'cmd'; name: string; arg?: unknown }
  | { type: 'getMarkdown'; reqId: number }

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (s: string) => void }
    notesBridge: { handle: (msg: Incoming) => void }
  }
}

const post = (msg: Record<string, unknown>): void => window.ReactNativeWebView?.postMessage(JSON.stringify(msg))

const dateLine = document.createElement('div')
dateLine.className = 'note-date-line'
const banner = document.createElement('div')
banner.className = 'deleted-banner'
banner.textContent = 'This note is in Recently Deleted. Recover it to edit.'
banner.hidden = true
const mount = document.getElementById('editor') as HTMLElement
document.body.insertBefore(banner, mount)
document.body.insertBefore(dateLine, mount)

function deriveMeta(e: Editor): { title: string; snippet: string; body: string } {
  const lines: string[] = []
  e.state.doc.descendants((node) => {
    if (node.isTextblock) {
      lines.push(node.textContent)
      return false
    }
    return true
  })
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean)
  return {
    title: (nonEmpty[0] ?? '').slice(0, 200),
    snippet: nonEmpty.slice(1).join(' ').slice(0, 200),
    body: lines.join('\n')
  }
}

function handlePaste(view: Editor['view'], event: ClipboardEvent): boolean {
  const html = event.clipboardData?.getData('text/html') ?? ''
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!text) return false
  const { $from } = view.state.selection
  if ($from.parent.type.name === 'codeBlock') return false
  const preferText = !html || (!/<table/i.test(html) && hasBoxTable(text))
  if (!preferText) return false
  const converted = plainTextToHtml(text)
  if (!converted) return false
  const dom = document.createElement('div')
  dom.innerHTML = converted
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(dom)
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
  return true
}

let pending: ReturnType<typeof setTimeout> | undefined
let loaded = false

const editor = new Editor({
  element: mount,
  extensions: buildExtensions(),
  content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] },
  editable: false,
  editorProps: {
    attributes: { class: 'note-content', spellcheck: 'true' },
    handlePaste: (view, event) => handlePaste(view, event),
    transformPastedHTML: (html) => normalizeHtml(html)
  },
  onUpdate: ({ transaction }) => {
    if (!loaded || transaction.getMeta('remote')) return
    clearTimeout(pending)
    pending = setTimeout(flush, 60)
  },
  onSelectionUpdate: () => emitState(),
  onTransaction: () => emitState(),
  onFocus: () => post({ type: 'focus', focused: true }),
  onBlur: () => post({ type: 'focus', focused: false })
})
// The shared command helpers are typed against the React flavour of the editor; the API used is the same.
const ed = editor as unknown as ReactEditor

function flush(): void {
  clearTimeout(pending)
  pending = undefined
  if (!loaded || editor.isDestroyed) return
  post({ type: 'update', content: editor.getJSON(), ...deriveMeta(editor) })
}

let lastState = ''
function emitState(): void {
  if (!loaded) return
  const state = {
    style: currentStyle(ed),
    list: currentList(ed),
    highlight: currentHighlight(ed),
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    quote: editor.isActive('blockquote'),
    table: editor.isActive('table'),
    task: editor.isActive('taskList'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo()
  }
  const key = JSON.stringify(state)
  if (key === lastState) return
  lastState = key
  post({ type: 'state', ...state })
}

function applyRemote(content: JSONContent): void {
  if (pending) return // a local edit is about to be saved and will win
  try {
    const doc = editor.schema.nodeFromJSON(content)
    if (doc.eq(editor.state.doc)) return
    const { from, to } = editor.state.selection
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content)
    const max = tr.doc.content.size
    tr.setSelection(TextSelection.between(tr.doc.resolve(Math.min(from, max)), tr.doc.resolve(Math.min(to, max))))
    tr.setMeta('remote', true).setMeta('addToHistory', false)
    editor.view.dispatch(tr)
  } catch (err) {
    console.warn('[editor] could not apply remote change', err)
  }
}

function focusEnd(): void {
  if (!editor.isEditable) return
  editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)).scrollIntoView())
  editor.view.focus()
}

function command(name: string, arg?: unknown): void {
  const chain = editor.chain().focus()
  switch (name) {
    case 'style':
      setStyle(ed, arg as BlockStyle)
      break
    case 'list':
      toggleList(ed, arg as ListKind)
      break
    case 'bold':
      chain.toggleBold().run()
      break
    case 'italic':
      chain.toggleItalic().run()
      break
    case 'underline':
      chain.toggleUnderline().run()
      break
    case 'strike':
      chain.toggleStrike().run()
      break
    case 'highlight':
      setHighlight(ed, (arg as HighlightColor | null) ?? null)
      break
    case 'quote':
      chain.toggleBlockquote().run()
      break
    case 'rule':
      chain.setHorizontalRule().run()
      break
    case 'table':
      insertTable(ed)
      break
    case 'tableOp': {
      const ops: Record<string, () => boolean> = {
        addRowBefore: () => chain.addRowBefore().run(),
        addRowAfter: () => chain.addRowAfter().run(),
        addColumnBefore: () => chain.addColumnBefore().run(),
        addColumnAfter: () => chain.addColumnAfter().run(),
        deleteRow: () => chain.deleteRow().run(),
        deleteColumn: () => chain.deleteColumn().run(),
        deleteTable: () => chain.deleteTable().run()
      }
      ops[String(arg)]?.()
      break
    }
    case 'indent':
      editor.commands.sinkListItem('taskItem') || editor.commands.sinkListItem('listItem')
      break
    case 'outdent':
      editor.commands.liftListItem('taskItem') || editor.commands.liftListItem('listItem')
      break
    case 'toggleChecked':
      toggleChecked(ed)
      break
    case 'undo':
      chain.undo().run()
      break
    case 'redo':
      chain.redo().run()
      break
  }
  emitState()
}

window.notesBridge = {
  handle(msg) {
    switch (msg.type) {
      case 'load':
        loaded = false
        clearTimeout(pending)
        pending = undefined
        document.documentElement.dataset.theme = msg.theme
        dateLine.textContent = msg.date
        banner.hidden = msg.editable
        editor.setEditable(msg.editable, false)
        editor.commands.setContent(msg.content, { emitUpdate: false })
        loaded = true
        lastState = ''
        emitState()
        if (msg.focus) setTimeout(focusEnd, 50)
        break
      case 'remote':
        applyRemote(msg.content)
        break
      case 'editable':
        banner.hidden = msg.editable
        editor.setEditable(msg.editable, false)
        break
      case 'theme':
        document.documentElement.dataset.theme = msg.theme
        break
      case 'date':
        dateLine.textContent = msg.date
        break
      case 'focus':
        focusEnd()
        break
      case 'blur':
        flush()
        editor.view.dom.blur()
        break
      case 'cmd':
        command(msg.name, msg.arg)
        break
      case 'getMarkdown':
        post({ type: 'markdown', reqId: msg.reqId, text: toMarkdown(editor.getJSON()), html: editor.getHTML() })
        break
    }
  }
}

// Tapping the empty space under the text puts the cursor at the end, like Notes.
document.body.addEventListener('mousedown', (e) => {
  if (e.target === document.body) {
    e.preventDefault()
    focusEnd()
  }
})
// Links open outside the WebView; the app intercepts the navigation.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a')
  if (a?.href) {
    e.preventDefault()
    post({ type: 'link', href: a.href })
  }
})
window.addEventListener('pagehide', flush)

post({ type: 'ready' })
