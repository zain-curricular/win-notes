import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from '@tiptap/react'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { Selection, TextSelection } from '@tiptap/pm/state'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bold,
  ChevronLeft,
  Copy,
  FileDown,
  Italic,
  ListChecks,
  MoreHorizontal,
  Pin,
  RotateCcw,
  SquarePen,
  Strikethrough,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Underline,
  X
} from 'lucide-react'
import { SearchField } from './SearchField'
import { buildExtensions } from '../editor/extensions'
import {
  currentAlign,
  currentHighlight,
  currentList,
  currentStyle,
  HIGHLIGHT_COLORS,
  insertTable,
  setAlign,
  setHighlight,
  setStyle,
  toggleList,
  type Alignment,
  type BlockStyle,
  type ListKind
} from '../editor/commands'
import { onRemoteNote, setEditorFlush, useStore, type Note } from '../lib/store'
import { fullDate } from '../lib/dates'
import { hasBoxTable, normalizeHtml, plainTextToDom } from '../lib/paste'
import { toMarkdown } from '../lib/markdown'
import { CASE_COMMANDS, changeCase } from '../editor/changeCase'
import { MenuList, openContextMenu, Popover, ToolButton, type MenuItem } from './ui'
import { shortcuts, SHORTCUTS, type EditorShortcutId } from '../lib/shortcuts'
import { noteMenu } from './NoteList'

function deriveMeta(editor: TiptapEditor): Pick<Note, 'title' | 'snippet' | 'body'> {
  const lines: string[] = []
  editor.state.doc.descendants((node) => {
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

/** Paste: keep rich HTML; turn Markdown and terminal box tables into formatted content. */
function handlePaste(view: TiptapEditor['view'], event: ClipboardEvent): boolean {
  const html = event.clipboardData?.getData('text/html') ?? ''
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!text) return false
  const { $from } = view.state.selection
  if ($from.parent.type.name === 'codeBlock') return false
  const preferText = !html || (!/<table/i.test(html) && hasBoxTable(text))
  if (!preferText) return false
  const dom = plainTextToDom(text)
  if (!dom) return false
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(dom)
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
  return true
}

// ---------- Format menu ("Aa") ----------

const STYLES: { style: BlockStyle; label: string; shortcut: EditorShortcutId }[] = [
  { style: 'title', label: 'Title', shortcut: 'styleTitle' },
  { style: 'heading', label: 'Heading', shortcut: 'styleHeading' },
  { style: 'subheading', label: 'Subheading', shortcut: 'styleSubheading' },
  { style: 'body', label: 'Body', shortcut: 'styleBody' },
  { style: 'mono', label: 'Monostyled', shortcut: 'styleMono' }
]

const LISTS: { kind: Exclude<ListKind, 'task'>; label: string; marker: string; shortcut: EditorShortcutId }[] = [
  { kind: 'bullet', label: 'Bulleted List', marker: '•', shortcut: 'bulletList' },
  { kind: 'dashed', label: 'Dashed List', marker: '–', shortcut: 'dashedList' },
  { kind: 'ordered', label: 'Numbered List', marker: '1.', shortcut: 'numberedList' }
]

const ALIGN_BUTTONS: { align: Alignment; label: string; icon: ReactNode; shortcut?: EditorShortcutId }[] = [
  { align: 'left', label: 'Align Left', icon: <TextAlignStart size={15} />, shortcut: 'alignLeft' },
  { align: 'center', label: 'Align Center', icon: <TextAlignCenter size={15} />, shortcut: 'alignCenter' },
  { align: 'right', label: 'Align Right', icon: <TextAlignEnd size={15} />, shortcut: 'alignRight' },
  { align: 'justify', label: 'Justify', icon: <TextAlignJustify size={15} /> }
]

function FormatMenu({ editor, onClose }: { editor: TiptapEditor; onClose: () => void }): ReactNode {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: currentStyle(e),
      list: currentList(e),
      quote: e.isActive('blockquote'),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: currentHighlight(e),
      align: currentAlign(e)
    })
  })
  return (
    <div className="format-menu">
      <div className="format-marks">
        {(
          [
            ['bold', <Bold key="b" size={15} strokeWidth={2.4} />, () => editor.chain().focus().toggleBold().run(), st.bold],
            ['italic', <Italic key="i" size={15} />, () => editor.chain().focus().toggleItalic().run(), st.italic],
            ['underline', <Underline key="u" size={15} />, () => editor.chain().focus().toggleUnderline().run(), st.underline],
            ['strikethrough', <Strikethrough key="s" size={15} />, () => editor.chain().focus().toggleStrike().run(), st.strike]
          ] as const
        ).map(([name, icon, run, on]) => (
          <button key={name} className={on ? 'on' : ''} title={name} onMouseDown={(e) => e.preventDefault()} onClick={run}>
            {icon}
          </button>
        ))}
      </div>
      <div className="format-marks">
        {ALIGN_BUTTONS.map((a) => (
          <button
            key={a.align}
            className={st.align === a.align ? 'on' : ''}
            title={a.shortcut ? `${a.label} (${shortcuts.label(a.shortcut)})` : a.label}
            aria-label={a.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAlign(editor, a.align)}
          >
            {a.icon}
          </button>
        ))}
      </div>
      <div className="format-highlights">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch swatch-${c}${st.highlight === c ? ' on' : ''}`}
            title={`Highlight ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setHighlight(editor, st.highlight === c ? null : c)}
          />
        ))}
        <button className="swatch swatch-none" title="Remove highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => setHighlight(editor, null)}>
          <X size={11} />
        </button>
      </div>
      <div className="menu-sep" />
      {STYLES.map((s) => (
        <button
          key={s.style}
          className={`format-style style-${s.style}${st.style === s.style && !st.list ? ' on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (setStyle(editor, s.style), onClose())}
        >
          <span className="format-check">{st.style === s.style && !st.list ? '✓' : ''}</span>
          <span className="format-label">{s.label}</span>
          <span className="menu-shortcut">{shortcuts.label(s.shortcut)}</span>
        </button>
      ))}
      <div className="menu-sep" />
      {LISTS.map((l) => (
        <button
          key={l.kind}
          className={`format-style${st.list === l.kind ? ' on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (toggleList(editor, l.kind), onClose())}
        >
          <span className="format-check">{st.list === l.kind ? '✓' : ''}</span>
          <span className="format-label">
            <span className="list-marker">{l.marker}</span>
            {l.label}
          </span>
          <span className="menu-shortcut">{shortcuts.label(l.shortcut)}</span>
        </button>
      ))}
      <button
        className={`format-style${st.quote ? ' on' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (editor.chain().focus().toggleBlockquote().run(), onClose())}
      >
        <span className="format-check">{st.quote ? '✓' : ''}</span>
        <span className="format-label">
          <span className="list-marker quote-marker">|</span>Block Quote
        </span>
        <span className="menu-shortcut">{shortcuts.label('blockQuote')}</span>
      </button>
    </div>
  )
}

// ---------- Toolbar ----------

function EditorToolbar({ editor, note, onBack }: { editor: TiptapEditor | null; note: Note | null; onBack?: () => void }): ReactNode {
  const [formatOpen, setFormatOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const formatRef = useRef<HTMLButtonElement>(null)
  const tableRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const { createNote } = useStore.getState()
  const deleted = !!note?.deleted_at

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? { task: e.isActive('taskList'), table: e.isActive('table') } : { task: false, table: false })
  })


  const tableItems: MenuItem[] = editor
    ? [
        { label: 'Add Row Above', shortcut: shortcuts.label('addRowBefore'), onSelect: () => editor.chain().focus().addRowBefore().run() },
        { label: 'Add Row Below', shortcut: shortcuts.label('addRowAfter'), onSelect: () => editor.chain().focus().addRowAfter().run() },
        { label: 'Add Column Before', shortcut: shortcuts.label('addColumnBefore'), onSelect: () => editor.chain().focus().addColumnBefore().run() },
        { label: 'Add Column After', shortcut: shortcuts.label('addColumnAfter'), onSelect: () => editor.chain().focus().addColumnAfter().run() },
        'separator',
        { label: 'Delete Row', onSelect: () => editor.chain().focus().deleteRow().run() },
        { label: 'Delete Column', onSelect: () => editor.chain().focus().deleteColumn().run() },
        { label: 'Delete Table', danger: true, onSelect: () => editor.chain().focus().deleteTable().run() }
      ]
    : []

  const exportItems = (): MenuItem[] => {
    if (!note || !editor) return []
    const md = (): string => toMarkdown(editor.getJSON())
    const fileName = `${(note.title || 'Note').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Note'}.md`
    return [
      { label: 'Copy as Markdown', icon: <Copy size={14} />, onSelect: () => navigator.clipboard.writeText(md()) },
      {
        label: 'Copy as Rich Text',
        icon: <Copy size={14} />,
        onSelect: () =>
          navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([editor.getHTML()], { type: 'text/html' }),
              'text/plain': new Blob([editor.getText({ blockSeparator: '\n' })], { type: 'text/plain' })
            })
          ])
      },
      {
        label: 'Export as Markdown…',
        icon: <FileDown size={14} />,
        onSelect: () => {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' }))
          a.download = fileName
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        }
      },
      'separator',
      ...noteMenu(note)
    ]
  }

  return (
    <div className="topbar editor-top">
      {onBack ? (
        <ToolButton label="Back to Gallery" onClick={onBack}>
          <ChevronLeft size={18} />
        </ToolButton>
      ) : null}
      <ToolButton label="New Note" shortcut={shortcuts.label('newNote')} onClick={() => createNote()}>
        <SquarePen size={17} />
      </ToolButton>
      <div className="toolbar-sep" />
      <ToolButton label="Format" buttonRef={formatRef} active={formatOpen} disabled={!editor || deleted} onClick={() => setFormatOpen((o) => !o)}>
        <span className="aa">Aa</span>
      </ToolButton>
      <ToolButton
        label="Checklist"
        shortcut={shortcuts.label('checklist')}
        active={st?.task}
        disabled={!editor || deleted}
        onClick={() => editor && toggleList(editor, 'task')}
      >
        <ListChecks size={17} />
      </ToolButton>
      <ToolButton
        label={st?.table ? 'Table Options' : 'Table'}
        shortcut={st?.table ? undefined : shortcuts.label('insertTable')}
        buttonRef={tableRef}
        active={st?.table || tableOpen}
        disabled={!editor || deleted}
        onClick={() => (editor && !st?.table ? insertTable(editor) : setTableOpen((o) => !o))}
      >
        <Table size={17} />
      </ToolButton>
      <div className="drag-spacer" />
      {note && deleted ? (
        <button className="text-btn" onClick={() => useStore.getState().recoverNote(note.id)}>
          <RotateCcw size={14} /> Recover
        </button>
      ) : null}
      {note && !deleted ? (
        <ToolButton label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => useStore.getState().togglePin(note.id)}>
          <Pin size={16} />
        </ToolButton>
      ) : null}
      <ToolButton label="Share and More" buttonRef={moreRef} active={moreOpen} disabled={!note} onClick={() => setMoreOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </ToolButton>
      <SearchField />

      <Popover open={formatOpen && !!editor} anchor={formatRef} onClose={() => setFormatOpen(false)}>
        {editor ? <FormatMenu editor={editor} onClose={() => setFormatOpen(false)} /> : null}
      </Popover>
      <Popover open={tableOpen && !!st?.table} anchor={tableRef} onClose={() => setTableOpen(false)}>
        <MenuList items={tableItems} onClose={() => setTableOpen(false)} />
      </Popover>
      <Popover open={moreOpen} anchor={moreRef} align="end" onClose={() => setMoreOpen(false)}>
        <MenuList items={exportItems()} onClose={() => setMoreOpen(false)} />
      </Popover>
    </div>
  )
}

// ---------- Note editor ----------

// Each focus request is used once. Otherwise every note opened afterwards (a search narrowing the list, an arrow
// key in the list) would pull the cursor out of whatever the person is typing in.
let handledFocusTick = 0
// Keys typed between a focus request (New Note, Enter in the list) and the new editor taking focus would be lost or
// land in the previous note; they are kept here and typed into the new note once it has focus.
let earlyKeys = ''

function NoteEditor({ note, onEditor }: { note: Note; onEditor: (e: TiptapEditor | null) => void }): ReactNode {
  const noteId = note.id
  const deleted = !!note.deleted_at
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<TiptapEditor | null>(null)

  const flush = useCallback(() => {
    clearTimeout(pending.current)
    pending.current = undefined
    const e = editorRef.current
    if (!e || e.isDestroyed) return
    useStore.getState().updateNote(noteId, { content: e.getJSON(), ...deriveMeta(e) })
  }, [noteId])

  const editor = useEditor(
    {
      extensions: buildExtensions(),
      content: note.content,
      editable: !deleted,
      editorProps: {
        attributes: { class: 'note-content', spellcheck: 'true' },
        handlePaste: (view, event) => handlePaste(view, event),
        transformPastedHTML: (html) => normalizeHtml(html)
      },
      onUpdate: ({ transaction }) => {
        if (transaction.getMeta('remote')) return
        clearTimeout(pending.current)
        pending.current = setTimeout(flush, 60)
      }
    },
    [noteId, deleted]
  )

  useEffect(() => setEditorFlush(() => pending.current && flush()), [flush])

  useEffect(() => {
    editorRef.current = editor
    onEditor(editor)
    return () => {
      if (pending.current) flush()
      onEditor(null)
    }
  }, [editor, flush, onEditor])

  // Apply edits made on another computer to the open note without disturbing the cursor more than needed.
  useEffect(
    () =>
      onRemoteNote((id) => {
        if (id !== noteId || !editor || editor.isDestroyed) return
        const remote = useStore.getState().notes[id]
        if (!remote) return
        if (pending.current) return // a local edit is about to be saved and will win
        try {
          const doc = editor.schema.nodeFromJSON(remote.content)
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
      }),
    [editor, noteId]
  )

  const focusTick = useStore((s) => s.focusEditorTick)
  useEffect(() => {
    if (!editor || focusTick === handledFocusTick) return
    // The previous note's editor stays mounted while it fades out; it lets go of focus so keys meant for the new note
    // are kept for it instead of edited into a note that is leaving the screen.
    if (useStore.getState().selectedNoteId !== noteId) {
      if (editor.view.hasFocus()) editor.view.dom.blur()
      return
    }
    if (deleted) {
      handledFocusTick = focusTick
      earlyKeys = ''
      return
    }
    // Focus directly: TipTap's focus command waits for a repaint, which Windows pauses for covered windows.
    const t = setTimeout(() => {
      if (editor.isDestroyed) return
      handledFocusTick = focusTick
      editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)))
      editor.view.focus()
      earlyKeys.split('\n').forEach((text, i) => {
        if (i) editor.commands.enter()
        if (text) editor.view.dispatch(editor.state.tr.insertText(text))
      })
      earlyKeys = ''
      editor.view.dispatch(editor.state.tr.scrollIntoView())
    }, 0)
    return () => clearTimeout(t)
  }, [focusTick, editor, deleted, noteId])

  return (
    <motion.div
      className="note-scroll"
      key={noteId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      onMouseDown={(e) => {
        // Clicking the empty area below the text puts the cursor at the end, like Notes.
        if (e.target === e.currentTarget && editor && !deleted) {
          e.preventDefault()
          editor.commands.focus('end')
        }
      }}
      onContextMenu={(e) => {
        if (!editor || deleted || !(e.target as HTMLElement).closest('.ProseMirror')) return
        openContextMenu(e, [
          {
            label: 'Change Case',
            submenu: CASE_COMMANDS.map(({ id, format }) => ({
              label: SHORTCUTS[id].title,
              shortcut: shortcuts.label(id),
              onSelect: () => {
                const tr = changeCase(editor.state, format)
                if (tr) editor.view.dispatch(tr)
              }
            }))
          }
        ])
      }}
    >
      {deleted ? <div className="deleted-banner">This note is in Recently Deleted. Recover it to edit.</div> : null}
      <div className="note-date-line">{fullDate(note.updated_at)}</div>
      <EditorContent editor={editor} />
    </motion.div>
  )
}

export function EditorPane({ onBack }: { onBack?: () => void }): ReactNode {
  const note = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] ?? null : null))
  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const onEditor = useCallback((e: TiptapEditor | null) => setEditor(e), [])
  const noteKey = note ? `${note.id}:${note.deleted_at ? 'd' : 'a'}` : 'none'

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const s = useStore.getState()
      if (!s.selectedNoteId || s.focusEditorTick === handledFocusTick || target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (e.key === 'Backspace') earlyKeys = earlyKeys.slice(0, -1)
      else if (e.key === 'Enter') earlyKeys += '\n'
      else if (e.key.length === 1) earlyKeys += e.key
      else return
      // Captured before the note list, where Backspace would delete the note these keys are meant for.
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="editor-pane">
      <EditorToolbar editor={editor} note={note} onBack={onBack} />
      <AnimatePresence mode="wait" initial={false}>
        {note ? (
          <NoteEditor key={noteKey} note={note} onEditor={onEditor} />
        ) : (
          <motion.div key="empty" className="editor-empty empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SquarePen size={32} strokeWidth={1.4} aria-hidden />
            <strong>No note selected</strong>
            <p>Choose a note from the list, or start a new one.</p>
            <button className="empty-action" onClick={() => useStore.getState().createNote()}>
              <SquarePen size={14} aria-hidden /> New Note
              <span className="menu-shortcut">{shortcuts.label('newNote')}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
