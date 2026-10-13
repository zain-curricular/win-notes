import { Extension, type Extensions } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import Highlight from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extensions'
import { insertTable, setStyle, toggleChecked, toggleList } from './commands'

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
            const decos: Decoration[] = []
            let hiddenBelow: number | null = null
            state.doc.forEach((node, offset) => {
              const isHeading = node.type.name === 'heading'
              if (isHeading && hiddenBelow !== null && node.attrs.level <= hiddenBelow) hiddenBelow = null
              if (hiddenBelow !== null) {
                decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'fold-hidden' }))
                return
              }
              if (!isHeading) return
              const collapsed = !!node.attrs.collapsed
              decos.push(
                Decoration.widget(offset + 1, (view) => chevron(view, offset, collapsed), {
                  side: -1,
                  ignoreSelection: true,
                  key: `fold-${offset}-${collapsed}`
                })
              )
              if (collapsed) {
                hiddenBelow = node.attrs.level
                decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-folded' }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          }
        }
      })
    ]
  }
})

/** Apple's Notes shortcuts (Cmd on Mac, Ctrl on Windows). */
const NotesShortcuts = Extension.create({
  name: 'notesShortcuts',
  priority: 1000,
  addKeyboardShortcuts() {
    const e = this.editor
    const inTable = (): boolean => e.isActive('table')
    return {
      'Mod-Shift-t': () => setStyle(e, 'title'),
      'Mod-Shift-h': () => setStyle(e, 'heading'),
      'Mod-Shift-j': () => setStyle(e, 'subheading'),
      'Mod-Shift-b': () => setStyle(e, 'body'),
      'Mod-Shift-m': () => setStyle(e, 'mono'),
      'Mod-Shift-7': () => toggleList(e, 'bullet'),
      'Mod-Shift-8': () => toggleList(e, 'dashed'),
      'Mod-Shift-9': () => toggleList(e, 'ordered'),
      'Mod-Shift-l': () => toggleList(e, 'task'),
      'Mod-Shift-u': () => toggleChecked(e),
      "Mod-'": () => e.chain().focus().toggleBlockquote().run(),
      'Mod-l': () => e.chain().focus().setHorizontalRule().run(),
      'Mod-Alt-t': () => insertTable(e),
      'Mod-]': () => e.commands.sinkListItem('taskItem') || e.commands.sinkListItem('listItem'),
      'Mod-[': () => e.commands.liftListItem('taskItem') || e.commands.liftListItem('listItem'),
      'Mod-Alt-ArrowUp': () => inTable() && e.chain().focus().addRowBefore().run(),
      'Mod-Alt-ArrowDown': () => inTable() && e.chain().focus().addRowAfter().run(),
      'Mod-Alt-ArrowLeft': () => inTable() && e.chain().focus().addColumnBefore().run(),
      'Mod-Alt-ArrowRight': () => inTable() && e.chain().focus().addColumnAfter().run()
    }
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
    Placeholder.configure({
      placeholder: ({ editor, node, pos }) => (pos === 0 && editor.isEmpty && node.type.name === 'heading' ? 'Title' : '')
    }),
    NotesShortcuts
  ]
}
