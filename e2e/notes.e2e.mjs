// End-to-end checks against the built app (npm run build first). Each suite runs in its own throwaway profile.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MOD, start } from './app.mjs'

const stored = (app) => app.js(`return Object.values(JSON.parse(localStorage.getItem('win-notes:local') ?? '{"notes":{}}').notes)`)

async function newNote(app, lines) {
  await app.key('n', [MOD])
  await app.waitFor(`document.activeElement?.closest('.ProseMirror')`)
  for (const [i, line] of lines.entries()) {
    if (i) await app.key('Enter')
    await app.typeKeys(line)
  }
}

describe('notes', () => {
  let app
  before(async () => {
    app = await start()
  })
  after(async () => {
    await app?.quit()
    app?.removeProfile()
  })

  it('keeps every key typed straight after New Note, in the new note', async () => {
    await newNote(app, ['First'])
    await app.key('n', [MOD])
    await app.typeKeys('Quickly')
    await app.key('Enter')
    await app.typeKeys('Soon')
    await app.waitFor(`$('.note-row.selected .note-title')?.textContent === 'Quickly'`)
    await app.click('.note-row .note-title', 'First')
    await app.key('n', [MOD])
    await app.typeKeys('Againn')
    await app.key('Backspace')
    await app.waitFor(`$('.note-row.selected .note-title')?.textContent === 'Again'`)
    await app.waitFor(`localStorage.getItem('win-notes:local')?.includes('"Again"')`)
    const notes = Object.fromEntries((await stored(app)).map((n) => [n.title, n.snippet]))
    assert.deepEqual(notes, { First: '', Quickly: 'Soon', Again: '' })
  })

  it('creates and renames a folder from the keyboard, and files a note in it', async () => {
    await app.key('n', [MOD, 'Shift'])
    await app.waitFor(`$('.folder-rename')`)
    await app.key('a', [MOD])
    await app.typeKeys('Work')
    await app.key('Enter')
    await app.waitFor(`$('.folder-row.active .folder-name')?.textContent === 'Work'`)
    await app.waitFor(`document.activeElement?.classList.contains('folder-row')`)
    await newNote(app, ['Plan', 'Ship it'])
    await app.waitFor(`Object.values(JSON.parse(localStorage.getItem('win-notes:local')).notes).some((n) => n.title === 'Plan' && n.folder_id)`)
  })

  it('shows the checklist button for the note on screen after switching notes', async () => {
    await newNote(app, ['Groceries'])
    await app.key('Enter')
    await app.key('l', [MOD, 'Shift'])
    await app.typeKeys('Milk')
    await app.waitFor(`$('[aria-label="Checklist"]').classList.contains('active')`)
    await app.click('.note-row .note-title', 'Plan')
    await app.waitFor(`$('.note-row.selected .note-title')?.textContent === 'Plan'`)
    await app.waitFor(`!$('[aria-label="Checklist"]').classList.contains('active')`, 3000)
  })

  it('narrows the list as you search and clears with Escape', async () => {
    await app.click('.folder-row .folder-name', 'All Notes')
    await app.key('f', [MOD])
    await app.typeKeys('groc')
    await app.waitFor(`$$('.note-row').length === 1 && $('.list-title').textContent === 'Search'`)
    await app.key('Escape')
    await app.waitFor(`$('.search-field input').value === '' && $$('.note-row').length > 1`)
  })

  it('moves a deleted note to Recently Deleted and recovers it', async () => {
    await app.click('.note-row .note-title', 'Groceries')
    await app.click('[aria-label="Delete"]')
    await app.waitFor(`byText('.folder-row .folder-name', 'Recently Deleted')`)
    await app.click('.folder-row .folder-name', 'Recently Deleted')
    await app.click('.note-row .note-title', 'Groceries')
    await app.click('.text-btn', 'Recover')
    await app.waitFor(`Object.values(JSON.parse(localStorage.getItem('win-notes:local')).notes).some((n) => n.title === 'Groceries' && n.deleted_at === null)`)
  })

  it('reaches folders and menus from the keyboard', async () => {
    await app.js(`$('.folder-row').focus()`)
    await app.key('Tab')
    assert.match(await app.js(`return document.activeElement.getAttribute('aria-label')`), /^Notes, \d+ notes?$/)
    await app.key('Enter')
    await app.waitFor(`$('.list-title').textContent === 'Notes'`)
    await app.js(`$('.note-list-scroll').focus()`)
    await app.key('F10', ['Shift'])
    await app.waitFor(`document.activeElement?.getAttribute('role') === 'menuitem'`)
    await app.key('ArrowDown')
    assert.equal(await app.js(`return document.activeElement.textContent`), 'Move To')
    await app.key('Escape')
    await app.waitFor(`document.activeElement?.classList.contains('note-list-scroll')`)
  })

  it('keeps the editor toolbar whole at the smallest window size', async () => {
    await app.size(760, 480)
    await app.waitFor(`$('.shell').classList.contains('narrow')`)
    const fits = await app.js(`const t = $('.editor-top'); return t.scrollWidth <= t.clientWidth`)
    assert.ok(fits, 'toolbar does not overflow')
    await app.click('[aria-label="Show Sidebar"]')
    await app.waitFor(`$('.sidebar-scrim')`)
    await app.click('.folder-row .folder-name', 'Work')
    await app.waitFor(`!$('.sidebar-scrim') && $('.list-title').textContent === 'Work'`)
    await app.send('Emulation.clearDeviceMetricsOverride')
  })

  it('pins a note to the top of the list', async () => {
    await app.click('.folder-row .folder-name', 'All Notes')
    await app.click('.note-row .note-title', 'First')
    await app.click('[aria-label="Pin"]')
    await app.waitFor(`$('.group-label')?.textContent === 'Pinned' && $('.note-row .note-title').textContent === 'First'`)
  })

  it('files a note in the folder it is dropped on', async () => {
    // HTML drag and drop can't be started from CDP mouse events, so the drag events are dispatched in the page.
    await app.js(`const dt = new DataTransfer(); const ev = (type) => new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })
      byText('.note-row', 'Quickly').dispatchEvent(ev('dragstart'))
      const folder = byText('.folder-row', 'Work'); folder.dispatchEvent(ev('dragover')); folder.dispatchEvent(ev('drop'))`)
    await app.click('.folder-row .folder-name', 'Work')
    await app.waitFor(`byText('.note-row .note-title', 'Quickly')`)
  })

  it('narrows a search with Match Case, Match Whole Word and Use Regular Expression', async () => {
    for (const title of ['Apple pie', 'apple tart', 'pineapple']) await newNote(app, [title])
    await app.click('.folder-row .folder-name', 'All Notes')
    await app.key('f', [MOD])
    await app.typeKeys('apple')
    const titles = (expected) => app.waitFor(`JSON.stringify($$('.note-row .note-title').map((t) => t.textContent).sort()) === ${JSON.stringify(JSON.stringify(expected))}`)
    await titles(['Apple pie', 'apple tart', 'pineapple'])
    await app.click('[aria-label="Match Case"]')
    await titles(['apple tart', 'pineapple'])
    await app.click('[aria-label="Match Whole Word"]')
    await titles(['apple tart'])
    await app.click('[aria-label="Match Case"]')
    await app.click('[aria-label="Match Whole Word"]')
    await app.click('[aria-label="Use Regular Expression"]')
    await app.key('f', [MOD])
    await app.typeKeys('^pine|pie$')
    await titles(['Apple pie', 'pineapple'])
    await app.click('[aria-label="Use Regular Expression"]')
    await app.key('Escape')
  })

  it('opens a note from the gallery and goes back to it', async () => {
    await app.key('2', [MOD])
    await app.click('.gallery-card .gallery-title', 'apple tart')
    await app.key('Enter')
    await app.waitFor(`$('[aria-label="Back to Gallery"]') && $('.ProseMirror')?.textContent === 'apple tart'`)
    await app.click('[aria-label="Back to Gallery"]')
    await app.waitFor(`$('.gallery') && !$('[aria-label="Back to Gallery"]')`)
    await app.key('1', [MOD])
    await app.waitFor(`!$('.gallery') && $('.note-row')`)
  })

  it('zooms in, out and back to actual size', async () => {
    const zoom = (value) => app.waitFor(`document.documentElement.style.getPropertyValue('--zoom') === '${value}'`)
    await app.key('=', [MOD])
    await zoom('1.1')
    await app.key('-', [MOD])
    await app.key('-', [MOD])
    await zoom('0.9')
    await app.key('0', [MOD])
    await zoom('1')
  })

  it('follows the system dark mode', async () => {
    const text = () => app.js(`return getComputedStyle(document.documentElement).getPropertyValue('--text').trim()`)
    await app.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    const light = await text()
    await app.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
    assert.notEqual(await text(), light)
    await app.send('Emulation.setEmulatedMedia', { features: [] })
  })

  it('logs no errors', () => {
    assert.deepEqual(app.errors, [])
  })
})

describe('after a restart', () => {
  it('still has the notes and folders', async () => {
    let app = await start()
    const profile = app.profile
    try {
      await newNote(app, ['Kept across restarts'])
      await app.click('.note-row .note-title', 'Kept across restarts')
      await app.quit()
      app = await start({ profile })
      await app.waitFor(`byText('.note-row .note-title', 'Kept across restarts')`)
    } finally {
      await app.quit()
      app.removeProfile()
    }
  })
})
