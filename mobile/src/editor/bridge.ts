// Message types shared with mobile-editor/main.ts (the page inside the WebView).
import type { JSONContent } from '../lib/store'

export type BlockStyle = 'title' | 'heading' | 'subheading' | 'body' | 'mono'
export type ListKind = 'bullet' | 'dashed' | 'ordered' | 'task'
export type HighlightColor = 'purple' | 'pink' | 'orange' | 'mint' | 'blue'
export const HIGHLIGHT_COLORS: HighlightColor[] = ['purple', 'pink', 'orange', 'mint', 'blue']
// The formats and titles of the desktop Change Case menu (src/renderer/src/editor/changeCase.ts); a test keeps them equal.
export const CASE_FORMATS = [
  { format: 'upper', label: 'UPPERCASE' },
  { format: 'lower', label: 'lowercase' },
  { format: 'title', label: 'Title Case' },
  { format: 'sentence', label: 'Sentence case' },
  { format: 'camel', label: 'camelCase' },
  { format: 'pascal', label: 'PascalCase' },
  { format: 'snake', label: 'snake_case' },
  { format: 'screamingSnake', label: 'SCREAMING_SNAKE_CASE' },
  { format: 'kebab', label: 'kebab-case' },
  { format: 'screamingKebab', label: 'SCREAMING-KEBAB-CASE' },
  { format: 'dot', label: 'dot.case' },
  { format: 'path', label: 'path/case' },
  { format: 'toggle', label: 'Toggle Case' }
] as const

export type EditorState = {
  style: BlockStyle
  list: ListKind | null
  highlight: HighlightColor | null
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  quote: boolean
  table: boolean
  task: boolean
  canUndo: boolean
  canRedo: boolean
}

export const INITIAL_STATE: EditorState = {
  style: 'body',
  list: null,
  highlight: null,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  quote: false,
  table: false,
  task: false,
  canUndo: false,
  canRedo: false
}

export type ToEditor =
  | { type: 'load'; content: JSONContent; editable: boolean; theme: 'light' | 'dark'; date: string; focus?: boolean }
  | { type: 'remote'; content: JSONContent }
  | { type: 'editable'; editable: boolean }
  | { type: 'theme'; theme: 'light' | 'dark' }
  | { type: 'date'; date: string }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'cmd'; name: string; arg?: unknown }
  | { type: 'getMarkdown'; reqId: number }

export type FromEditor =
  | { type: 'ready' }
  | { type: 'update'; content: JSONContent; title: string; snippet: string; body: string }
  | ({ type: 'state' } & EditorState)
  | { type: 'focus'; focused: boolean }
  | { type: 'link'; href: string }
  | { type: 'markdown'; reqId: number; text: string; html: string }

/** JavaScript to run inside the WebView to deliver a message. */
export function bridgeScript(msg: ToEditor): string {
  return `window.notesBridge && window.notesBridge.handle(${JSON.stringify(msg)}); true;`
}
