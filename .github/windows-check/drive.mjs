// Launches the built app, presses shortcuts with real Windows key events (keys.ps1) and reads the result
// through the DevTools protocol. Usage: node drive.mjs <app dir> <master|branch> <output dir>
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [appDir, target, outDir] = [resolve(process.argv[2]), process.argv[3], resolve(process.argv[4])]
const isBranch = target === 'branch'
const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const electron = createRequire(join(appDir, 'package.json'))('electron')
const appLog = createWriteStream(join(outDir, 'electron.log'))
const app = spawn(electron, ['.'], { cwd: appDir, env: { ...process.env, NOTES_PROFILE: 'ci', NOTES_CDP_PORT: '9333' } })
app.stdout.pipe(appLog)
app.stderr.pipe(appLog)

let page
for (let i = 0; i < 120 && !page; i++) {
  page = await fetch('http://127.0.0.1:9333/json').then((r) => r.json()).then((ts) => ts.find((t) => t.type === 'page')).catch(() => undefined)
  if (!page) await sleep(500)
}
if (!page) throw new Error('The app never opened a page on the DevTools port')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let nextId = 0
const waiting = new Map()
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.method === 'Runtime.consoleAPICalled')
    appendFileSync(join(outDir, 'console.log'), `${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}\n`)
  if (msg.id && waiting.has(msg.id)) waiting.get(msg.id)(msg)
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId
    waiting.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed')
  return r.result?.result?.value
}
await send('Runtime.enable')

const keyLog = join(outDir, 'keys.log')
const keys = async (combo, layout = '') => {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'keys.ps1'), '-Combo', combo]
  if (layout) args.push('-Layout', layout)
  const out = execFileSync('powershell', args, { encoding: 'utf8' })
  await sleep(500)
  const seen = await evaluate(`window.__keydowns.splice(0)`).catch(() => [])
  appendFileSync(keyLog, `${combo || '(none)'} ${layout} -> ${out.trim().replace(/\s+/g, ' ')} | page saw ${JSON.stringify(seen)}\n`)
  return out
}
const recordKeydowns = () =>
  evaluate(`window.__keydowns = []; window.addEventListener('keydown', (e) => window.__keydowns.push(
    [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', 'key=' + e.key, 'code=' + e.code].filter(Boolean).join('+')), true)`)
const waitFor = async (expr) => {
  for (let i = 0; i < 50; i++) {
    if (await evaluate(expr).catch(() => false)) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${expr}`)
}
const state = () =>
  evaluate(`(() => ({
    sidebar: document.querySelector('.shell')?.dataset.sidebar,
    notes: document.querySelectorAll('.note-row').length,
    gallery: !!document.querySelector('.gallery-wrap, .gallery-editor'),
    galleryEditor: !!document.querySelector('.gallery-editor'),
    searchFocused: document.activeElement?.closest('.search-field') != null,
    html: document.querySelector('.ProseMirror')?.innerHTML ?? '',
    text: document.querySelector('.ProseMirror')?.innerText ?? ''
  }))()`)
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
}
const focusEditorEnd = () =>
  evaluate(`(() => {
    const pm = document.querySelector('.ProseMirror')
    pm.focus()
    const r = document.createRange()
    r.selectNodeContents(pm)
    r.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(r)
  })()`)
const selectWrittenNote = () =>
  evaluate(`[...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.note-title').textContent !== 'New Note')?.click()`)
const count = (text, ch) => text.split(ch).length - 1

const results = []
const check = (name, expected, actual) => {
  const pass = JSON.stringify(expected) === JSON.stringify(actual)
  results.push({ name, expected, actual, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}
const step = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    results.push({ name, expected: 'no error', actual: String(err.message ?? err), pass: false })
    console.log(`FAIL  ${name}  error=${err.message ?? err}`)
    await shot(`error-${results.length}`).catch(() => {})
  }
}

let s
await waitFor(`!!document.querySelector('.shell .note-list')`)
await recordKeydowns()
await keys('', '00000409')
await shot('01-start')

await step('Tooltips use Windows key names', async () => {
  const titles = await evaluate(`[...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title'))`)
  const wanted = ['New Note (Ctrl+N)', 'Hide Sidebar (Ctrl+Alt+S)', 'List (Ctrl+1)', 'Gallery (Ctrl+2)', 'New Folder (Ctrl+Shift+N)']
  check('Tooltips use Windows key names', [], wanted.filter((t) => !titles.includes(t)))
})
await step('Ctrl+N creates a note', async () => {
  s = await state()
  await keys('ctrl+n')
  check('Ctrl+N creates a note', s.notes + 1, (await state()).notes)
})
await step('Editor shortcuts', async () => {
  await waitFor(`!!document.querySelector('.ProseMirror')`)
  await focusEditorEnd()
  await send('Input.insertText', { text: 'Windows check' })
  await keys('enter')
  await send('Input.insertText', { text: 'item' })
  await keys('ctrl+shift+7')
  check('Ctrl+Shift+7 makes a bulleted list', true, /<ul/.test((await state()).html))
})
await step('Ctrl+D duplicates the note while typing in it', async () => {
  s = await state()
  await keys('ctrl+d')
  check('Ctrl+D duplicates the note while typing in it', s.notes + 1, (await state()).notes)
})
await step('Ctrl+Alt+S toggles the sidebar', async () => {
  await keys('ctrl+alt+s')
  check('Ctrl+Alt+S hides the sidebar', 'closed', (await state()).sidebar)
  await shot('02-sidebar-hidden')
  await keys('ctrl+alt+s')
  check('Ctrl+Alt+S shows the sidebar again', 'open', (await state()).sidebar)
})
await step('Search shortcuts', async () => {
  await keys('ctrl+f')
  check('Ctrl+F focuses search', true, (await state()).searchFocused)
  await keys('esc')
  await focusEditorEnd()
  await keys('ctrl+alt+f')
  check('Ctrl+Alt+F focuses search', true, (await state()).searchFocused)
  await keys('esc')
})
await step('Gallery and Esc', async () => {
  await keys('ctrl+2')
  check('Ctrl+2 switches to the gallery', true, (await state()).gallery)
  await evaluate(`document.querySelector('.gallery-card').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await waitFor(`!!document.querySelector('.gallery-editor .ProseMirror')`)
  await focusEditorEnd()
  await keys('esc')
  await sleep(800)
  check('Esc closes the gallery editor with the cursor in the note', false, (await state()).galleryEditor)
  await keys('ctrl+1')
  check('Ctrl+1 switches back to the list', false, (await state()).gallery)
})
await step('Ctrl+Alt+N', async () => {
  await selectWrittenNote()
  s = await state()
  await keys('ctrl+alt+n')
  // The branch matches exact modifiers; master ignored the extra Alt.
  check('Ctrl+Alt+N (extra modifier)', isBranch ? s.notes : s.notes + 1, (await state()).notes)
})
await step('Polish layout (AltGr)', async () => {
  await selectWrittenNote()
  await waitFor(`!!document.querySelector('.ProseMirror')`)
  await focusEditorEnd()
  const layout = await keys('', '00000415')
  check('Polish layout is active in the Notes window', true, /layout=04150415/.test(layout))
  const before = await state()
  await keys('altgr+s')
  const afterAltGr = await state()
  check('Polish: AltGr+S types ś', count(before.text, 'ś') + 1, count(afterAltGr.text, 'ś'))
  check('Polish: AltGr+S leaves the sidebar alone', before.sidebar, afterAltGr.sidebar)
  await keys('ctrl+alt+s')
  const afterCtrlAlt = await state()
  // Windows treats Ctrl+Alt as AltGr on layouts that have AltGr characters.
  check('Polish: Ctrl+Alt+S types ś like AltGr', count(before.text, 'ś') + 2, count(afterCtrlAlt.text, 'ś'))
  check('Polish: Ctrl+Alt+S leaves the sidebar alone', before.sidebar, afterCtrlAlt.sidebar)
  await shot('03-polish')
  await selectWrittenNote()
  s = await state()
  await keys('ctrl+d')
  check('Polish: Ctrl+D duplicates the note', s.notes + 1, (await state()).notes)
})
await step('Russian layout (non-Latin)', async () => {
  await selectWrittenNote()
  await waitFor(`!!document.querySelector('.ProseMirror')`)
  await focusEditorEnd()
  const layout = await keys('', '00000419')
  check('Russian layout is active in the Notes window', true, /layout=04190419/.test(layout))
  const before = await state()
  await keys('d')
  check('Russian: the D key types в', count(before.text, 'в') + 1, count((await state()).text, 'в'))
  await selectWrittenNote()
  s = await state()
  await keys('ctrl+d')
  // master compared the typed letter, which is в here; the branch falls back to the physical key.
  check('Russian: Ctrl+D duplicates the note', isBranch ? s.notes + 1 : s.notes, (await state()).notes)
  await shot('04-russian')
  await keys('', '00000409')
})

ws.close()
app.kill()
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass)
const table = [
  `### ${target === 'branch' ? 'Phase 1 branch' : 'master (baseline)'}: ${results.length - failed.length}/${results.length} passed`,
  '',
  '| | Check | Expected | Actual |',
  '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.pass ? '✅' : '❌'} | ${r.name} | ${JSON.stringify(r.expected)} | ${JSON.stringify(r.actual)} |`),
  ''
].join('\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table)
process.exit(failed.length ? 1 : 0)
