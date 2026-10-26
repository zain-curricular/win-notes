import { Extension, type Extensions } from '@tiptap/core'
import { keydownHandler } from '@tiptap/pm/keymap'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import Highlight from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extensions'
import TextAlign from '@tiptap/extension-text-align'
import { CASE_COMMANDS, changeCase, type CaseShortcutId } from './changeCase'
import { insertTable, setAlign, setStyle, toggleChecked, toggleList } from './commands'
import { foldedRanges } from './folds'
import { copyLines, LineClipboard } from './lineCopy'
import { MultiSelect } from './multiSelection'
import { SelectionMatches } from './selectionHighlight'
import { shortcuts, SHORTCUTS, shortcutsVersion, type EditorShortcutId } from '../lib/shortcuts'

/** Lets a bulleted list render with dashes (macOS "Dashed List"). */
const DashedList = Extension.create({
  name: 'dashedList',
  addGlobalAttributes() {
    return [
      {
        types: ['bulletList'],
        attributes: {
          dashed: {
            default: false,
            parseHTML: (el) => el.getAttribute('data-style') === 'dashed',
            renderHTML: (attrs) => (attrs.dashed ? { 'data-style': 'dashed' } : {})
          }
        }
      }
    ]
  }
})

function chevron(view: EditorView, pos: number, collapsed: boolean): HTMLElement {
  const el = document.createElement('span')
  el.className = `heading-fold${collapsed ? ' is-collapsed' : ''}`
  el.contentEditable = 'false'
  el.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section')
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'heading') return
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: !node.attrs.collapsed }))
  })
  return el
}

/** Headings fold the content below them, like collapsible sections in macOS Notes. */
const CollapsibleHeadings = Extension.create({
  name: 'collapsibleHeadings',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          collapsed: {
            default: false,
            parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
            renderHTML: (attrs) => (attrs.collapsed ? { 'data-collapsed': 'true' } : {})
          }
        }
      }
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('collapsibleHeadings'),
        props: {
          decorations(state) {
            const folded = foldedRanges(state.doc)
            const hidden = new Set(folded.map((r) => r.from))
            const decos = folded.map((r) => Decoration.node(r.from, r.to, { class: 'fold-hidden' }))
            state.doc.forEach((node, offset) => {
              if (node.type.name !== 'heading' || hidden.has(offset)) return
              const collapsed = !!node.attrs.collapsed
              decos.push(
                Decoration.widget(offset + 1, (view) => chevron(view, offset, collapsed), {
                  side: -1,
                  ignoreSelection: true,
                  key: `fold-${offset}-${collapsed}`
                })
              )
              if (collapsed) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-folded' }))
            })
            return DecorationSet.create(state.doc, decos)
          }
        }
      })
    ]
  }
})

/** Apple's Notes shortcuts (Cmd on Mac, Ctrl on Windows), plus any keys changed in Keyboard Shortcuts. */
const NotesShortcuts = Extension.create({
  name: 'notesShortcuts',
  priority: 1000,
  addProseMirrorPlugins() {
    const e = this.editor
    const inTable = (): boolean => e.isActive('table')
    const apply = (tr: Transaction | null): boolean => !!tr && (e.view.dispatch(tr), true)
    const handlers = {
      styleTitle: () => setStyle(e, 'title'),
      styleHeading: () => setStyle(e, 'heading'),
      styleSubheading: () => setStyle(e, 'subheading'),
      styleBody: () => setStyle(e, 'body'),
      styleMono: () => setStyle(e, 'mono'),
      bulletList: () => toggleList(e, 'bullet'),
      dashedList: () => toggleList(e, 'dashed'),
      numberedList: () => toggleList(e, 'ordered'),
      checklist: () => toggleList(e, 'task'),
      toggleChecked: () => toggleChecked(e),
      blockQuote: () => e.chain().focus().toggleBlockquote().run(),
      divider: () => e.chain().focus().setHorizontalRule().run(),
      insertTable: () => insertTable(e),
      indent: () => e.commands.sinkListItem('taskItem') || e.commands.sinkListItem('listItem'),
      outdent: () => e.commands.liftListItem('taskItem') || e.commands.liftListItem('listItem'),
      addRowBefore: () => inTable() && e.chain().focus().addRowBefore().run(),
      addRowAfter: () => inTable() && e.chain().focus().addRowAfter().run(),
      addColumnBefore: () => inTable() && e.chain().focus().addColumnBefore().run(),
      addColumnAfter: () => inTable() && e.chain().focus().addColumnAfter().run(),
      alignLeft: () => setAlign(e, 'left'),
      alignCenter: () => setAlign(e, 'center'),
      alignRight: () => setAlign(e, 'right'),
      copyLineDown: () => apply(copyLines(e.state, 'down')),
      copyLineUp: () => apply(copyLines(e.state, 'up')),
      ...(Object.fromEntries(CASE_COMMANDS.map(({ id, format }) => [id, () => apply(changeCase(e.state, format))])) as Record<
        CaseShortcutId,
        () => boolean
      >)
    }
    // A key TipTap also binds is always taken, or Body on a line that is already Body would fall through to its block quote.
    const owned = Object.fromEntries(
      Object.entries(handlers).map(([id, run]) => [id, 'replacesBuiltIn' in SHORTCUTS[id as EditorShortcutId] ? () => (run(), true) : run])
    ) as typeof handlers
    // Rebuilt only when a shortcut changes, since TipTap's own keyboard shortcuts are fixed once the editor exists.
    let built = -1
    let handle = keydownHandler({})
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (built !== shortcutsVersion()) {
              handle = keydownHandler(shortcuts.keymap(owned))
              built = shortcutsVersion()
            }
            return handle(view, event)
          }
        }
      })
    ]
  }
})

export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Keep a free line after tables and code, but not after the title, so new notes start in the title.
      trailingNode: { notAfter: ['paragraph', 'heading'] },
      link: { openOnClick: true, autolink: true, defaultProtocol: 'https' }
    }),
    DashedList,
    CollapsibleHeadings,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 60 } }),
    Highlight.configure({ multicolor: true }),
    // Its own shortcuts take Checklist and Subheading keys; ours come from the shortcut registry.
    TextAlign.extend({ addKeyboardShortcuts: () => ({}) }).configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({
      placeholder: ({ editor, node, pos }) => (pos === 0 && editor.isEmpty && node.type.name === 'heading' ? 'Title' : '')
    }),
    NotesShortcuts,
    LineClipboard,
    MultiSelect,
    SelectionMatches
  ]
}
