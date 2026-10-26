// The editing features and note tools from the README, driven through the built app.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MOD, start } from './app.mjs'

const BOX_TABLE = ['┌──────┬─────┐', '│ Name │ Qty │', '├──────┼─────┤', '│ Milk │ 2   │', '└──────┴─────┘'].join('\n')

describe('editing', () => {
  let app
  before(async () => {
    app = await start()
  })
  after(async () => {
    await app?.quit()
    app?.removeProfile()
  })

  const html = (selector) => app.js(`return $$(${JSON.stringify(`.ProseMirror ${selector}`)}).map((el) => el.textContent)`)

  // The first line of a new note is its title.
  async function newNote(...lines) {
    await app.key('n', [MOD])
    await app.waitFor(`document.activeElement?.closest('.ProseMirror')`)
    for (const [i, line] of lines.entries()) {
      if (i) await app.key('Enter')
      await app.typeKeys(line)
    }
  }

  // CDP key events on macOS don't run editing commands such as Select All, so text is selected through the DOM.
  async function select(text) {
    await app.js(`const pm = $('.ProseMirror'); pm.focus(); const walk = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
      for (let n; (n = walk.nextNode()); ) { const i = n.data.indexOf(${JSON.stringify(text)})
        if (i >= 0) return getSelection().setBaseAndExtent(n, i, n, i + ${text.length}) }
      throw new Error('no text ${text}')`)
    await app.waitFor(`getSelection().toString() === ${JSON.stringify(text)}`)
  }

  const caretAtEnd = () =>
    app.js(`const pm = $('.ProseMirror'); pm.focus(); const r = document.createRange(); r.selectNodeContents(pm.lastElementChild)
      r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r)`)

  // Clipboard events built in the page, so the tests never read or overwrite the clipboard of the machine running them.
  const clipboardEvent = (type, data = {}) =>
    app.js(`const dt = new DataTransfer(); for (const [k, v] of Object.entries(${JSON.stringify(data)})) dt.setData(k, v)
      $('.ProseMirror').dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: dt, bubbles: true, cancelable: true }))
      return dt.getData('text/plain')`)

  it('applies every text style, list and block quote from its shortcut', async () => {
    await newNote('Big')
    await app.key('t', [MOD, 'Shift'])
    // Body on a line that is already Body; TipTap's own key for it is Block Quote. Lists of one kind next to each other
    // join, so a numbered list sits between the bulleted and dashed ones.
    for (const [text, keys] of [
      ['Section', ['h', [MOD, 'Shift']]],
      ['Sub', ['j', [MOD, 'Shift']]],
      ['Plain', ['b', [MOD, 'Shift']]],
      ['One', ['7', [MOD, 'Shift']]],
      ['Num', ['9', [MOD, 'Shift']]],
      ['Dash', ['8', [MOD, 'Shift']]],
      ['Task', ['l', [MOD, 'Shift']]]
    ]) {
      await app.key('Enter')
      // Enter on an empty list item leaves the list.
      if (['Num', 'Dash', 'Task'].includes(text)) await app.key('Enter')
      await app.typeKeys(text)
      await app.key(...keys)
    }
    await app.key('u', [MOD, 'Shift'])
    await app.key('Enter')
    await app.key('Enter')
    await app.typeKeys('Quote')
    await app.key("'", [MOD])
    await app.key('Enter')
    await app.key("'", [MOD])
    await app.typeKeys('code')
    await app.key('m', [MOD, 'Shift'])
    await app.waitFor(`$('.ProseMirror pre')?.textContent === 'code'`)
    assert.deepEqual(
      await app.js(`return ['h1', 'h2', 'h3', '> p', 'ul:not([data-style]):not([data-type]) li', 'ol li', 'ul[data-style="dashed"] li',
        'ul[data-type="taskList"] li[data-checked="true"] p', 'blockquote']
        .map((s) => $$('.ProseMirror ' + s).map((el) => el.textContent.trim()).filter(Boolean))`),
      [['Big'], ['Section'], ['Sub'], ['Plain'], ['One'], ['Num'], ['Dash'], ['Task'], ['Quote']]
    )
  })

  it('highlights and aligns text from the format menu, and grows a table', async () => {
    await newNote('Table', 'Colour me')
    await select('Colour')
    await app.click('[aria-label="Format"]')
    await app.click('[aria-label="Highlight pink"]')
    await app.click('[aria-label="Align Center"]')
    await app.key('Escape')
    assert.deepEqual(await html('mark[data-color="pink"]'), ['Colour'])
    assert.equal(await app.js(`return $('.ProseMirror p').style.textAlign`), 'center')
    await caretAtEnd()
    await app.key('Enter')
    await app.key('t', [MOD, 'Alt'])
    await app.waitFor(`$$('.ProseMirror tr').length === 3`)
    await app.key('ArrowDown', [MOD, 'Alt'])
    await app.waitFor(`$$('.ProseMirror tr').length === 4 && $$('.ProseMirror tr:first-child > *').length === 3`)
  })

  it('folds the lines under a heading and opens them again', async () => {
    await newNote('Folds', 'Part')
    await app.key('h', [MOD, 'Shift'])
    await app.key('Enter')
    await app.typeKeys('Hidden line')
    await app.click('.ProseMirror h2 .heading-fold')
    await app.waitFor(`byText('.ProseMirror p', 'Hidden line').classList.contains('fold-hidden')`)
    await app.click('.ProseMirror h2 .heading-fold')
    await app.waitFor(`!byText('.ProseMirror p', 'Hidden line').classList.contains('fold-hidden')`)
  })

  it('turns pasted Markdown, terminal box tables and rich text into formatting', async () => {
    await newNote('Pasted', 'Here')
    await app.key('Enter')
    await clipboardEvent('paste', { 'text/plain': '- apple\n- pear' })
    await app.waitFor(`$$('.ProseMirror ul li').length === 2`)
    await app.key('Enter')
    await app.key('Enter')
    await clipboardEvent('paste', { 'text/plain': BOX_TABLE })
    await app.waitFor(`$$('.ProseMirror tr').length === 2`)
    assert.deepEqual(await html('tr'), ['NameQty', 'Milk2'])
    await select('Here')
    await clipboardEvent('paste', { 'text/html': '<b>Bold</b> word', 'text/plain': 'Bold word' })
    await app.waitFor(`byText('.ProseMirror strong', 'Bold')`)
  })

  it('boxes the other copies of the selection, edits every copy after Mod-D, and copies a line down', async () => {
    await newNote('Copies', 'cat dog cat')
    await select('cat')
    await app.waitFor(`$$('.ProseMirror .selection-match').length === 1`)
    await app.key('d', [MOD])
    await app.waitFor(`$$('.ProseMirror .multi-selection').length === 1`)
    await app.typeKeys('X')
    await app.waitFor(`$('.ProseMirror p')?.textContent === 'X dog X'`)
    await app.key('Escape')
    await app.key('ArrowDown', ['Alt', 'Shift'])
    assert.deepEqual(await html('p'), ['X dog X', 'X dog X'])
  })

  it('copies and cuts the whole line when nothing is selected', async () => {
    await newNote('Lines', 'keep me', 'cut me')
    assert.equal(await clipboardEvent('copy'), 'cut me\n')
    assert.equal(await clipboardEvent('cut'), 'cut me\n')
    assert.deepEqual(await html('p'), ['keep me'])
  })

  it('changes case from the right-click menu', async () => {
    await newNote('Case', 'make loud')
    await select('make loud')
    await app.click('.ProseMirror p', 'make loud', { button: 'right' })
    await app.click('.menu-label', 'Change Case')
    await app.waitFor(`$('.submenu')`)
    assert.ok(await app.js(`const r = $('.submenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight`), 'the submenu is inside the window')
    await app.click('.submenu .menu-label', 'UPPERCASE')
    await app.waitFor(`$('.ProseMirror p')?.textContent === 'MAKE LOUD'`)
  })

  it('uses a key given to a command in Keyboard Shortcuts', async () => {
    await app.key(',', [MOD])
    await app.waitFor(`document.activeElement?.closest('.shortcut-filter')`)
    await app.typeKeys('lowercase')
    await app.waitFor(`$$('.shortcut-row').length === 1 && $('.shortcut-row .shortcut-title').textContent === 'lowercase'`)
    await app.click('.shortcut-row button', 'Change')
    await app.waitFor(`$('.shortcut-prompt')`)
    await app.key('y', [MOD, 'Shift'])
    await app.waitFor(`byText('.shortcut-row', 'lowercase')?.querySelector('.shortcut-badge')`)
    await app.key('Escape')
    await app.waitFor(`!$('.shortcut-sheet')`)
    await select('MAKE LOUD')
    await app.key('y', [MOD, 'Shift'])
    await app.waitFor(`$('.ProseMirror p')?.textContent === 'make loud'`)
  })

  it('copies the note as Markdown', async () => {
    await app.click('.note-row .note-title', 'Big')
    await app.waitFor(`$('.ProseMirror h1')?.textContent === 'Big'`)
    await app.js(`window.copied = null; navigator.clipboard.writeText = async (t) => { window.copied = t }`)
    await app.click('[aria-label="Share and More"]')
    await app.click('.menu-label', 'Copy as Markdown')
    await app.waitFor(`window.copied`)
    const md = await app.js(`return window.copied`)
    assert.match(md, /^# Big\n\n## Section\n\n### Sub\n\nPlain\n\n- One\n/)
    assert.match(md, /- \[x\] Task/)
  })

  it('logs no errors', () => {
    assert.deepEqual(app.errors, [])
  })
})
