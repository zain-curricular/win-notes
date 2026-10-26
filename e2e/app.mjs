// Starts the built app with its own throwaway profile and drives it over the DevTools protocol with real input events.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = join(import.meta.dirname, '..')
const electron = createRequire(import.meta.url)('electron')

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

function userData() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Notes')
  if (process.platform === 'win32') return join(process.env.APPDATA, 'Notes')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Notes')
}

/** The app's window on a DevTools port, once it has opened. */
export async function connect(port, { tries = 150 } = {}) {
  let page
  for (let i = 0; i < tries && !page; i++) {
    await sleep(200)
    page = await fetch(`http://127.0.0.1:${port}/json`)
      .then((r) => r.json())
      .then((list) => list.find((p) => p.type === 'page'))
      .catch(() => undefined)
  }
  if (!page) throw new Error('the app did not open a window')
  return drive(page.webSocketDebuggerUrl)
}

/** Starts the app from this checkout, or an installed copy when `executable` is given. */
export async function launch({ profile = `e2e-${randomBytes(4).toString('hex')}`, env: extra = {}, executable } = {}) {
  const port = 9400 + Math.floor(Math.random() * 500)
  const env = { ...process.env, ...extra, NOTES_PROFILE: profile, NOTES_CDP_PORT: String(port) }
  delete env.ELECTRON_RUN_AS_NODE
  // Hosted Linux runners and containers have no setuid sandbox helper.
  const args = [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(executable ? [] : [root])]
  const child = spawn(executable ?? electron, args, { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const exited = new Promise((r) => child.once('exit', r))

  const app = await connect(port).catch((err) => {
    child.kill()
    throw new Error(`${err.message}\n${stderr.slice(-2000)}`)
  })
  app.port = port
  app.exited = exited
  app.profile = profile
  app.dataDir = join(userData(), `profile-${profile}`)
  app.quit = async () => {
    if (child.exitCode !== null) return app.close()
    // Closing the window lets the page save and Chromium write storage to disk; a killed process skips both on Windows.
    app.send('Runtime.evaluate', { expression: 'window.close()' })
    const closed = process.platform !== 'darwin' && (await Promise.race([exited.then(() => true), sleep(10000).then(() => false)]))
    app.close()
    if (!closed) child.kill()
    await exited
  }
  app.removeProfile = () => rmSync(app.dataDir, { recursive: true, force: true })
  return app
}

// Launches past the sign-in screen with the shell ready for keyboard shortcuts.
export async function start(options) {
  const app = await launch(options)
  try {
    // A build with cloud sync configured opens on the sign-in screen.
    await app.waitFor(`$('.shell') || byText('button', 'Use without syncing')`, 20000)
    if (!(await app.js(`return !!$('.shell')`))) await app.click('button', 'Use without syncing')
    // The shell's keyboard shortcuts are attached once it has faded in, not when it first appears.
    await app.waitFor(`$('.shell') && getComputedStyle($('.fill')).opacity === '1'`)
    return app
  } catch (err) {
    await app.quit()
    if (!options?.profile) app.removeProfile()
    throw err
  }
}

async function drive(url) {
  const ws = new WebSocket(url)
  await new Promise((r, j) => (ws.addEventListener('open', r), ws.addEventListener('error', j)))
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq
      pending.set(id, r)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')

  const HELPERS = `const $ = (s) => document.querySelector(s); const $$ = (s) => [...document.querySelectorAll(s)];
    const byText = (sel, t) => $$(sel).find((el) => el.textContent.trim().includes(t));
    const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50) });`
  const js = async (body) => {
    const m = await send('Runtime.evaluate', { expression: `(async () => { ${HELPERS} ${body} })()`, awaitPromise: true, returnByValue: true })
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? m.result.exceptionDetails.text)
    return m.result?.result?.value
  }
  const waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms
    for (;;) {
      if (await js(`return !!(${expr})`)) return
      if (Date.now() > end) {
        const state = await js(`const a = document.activeElement; return { focus: a?.tagName + '.' + a?.className, notes: $$('.note-row .note-title').map((t) => t.textContent) }`)
        throw new Error(`timed out waiting for ${expr}\n${JSON.stringify(state)}`)
      }
      await sleep(100)
    }
  }
  // The centre of an element once it has stopped moving and nothing animating covers it, so clicks land where they are aimed.
  const point = async (selector, text) => {
    const find = text === undefined ? `$(${JSON.stringify(selector)})` : `byText(${JSON.stringify(selector)}, ${JSON.stringify(text)})`
    const r = await js(`let el = ${find}; for (let i = 0; !el && i < 60; i++) { await frame(); el = ${find} }
      if (!el) return null; el.scrollIntoView({ block: 'nearest' }); let b = el.getBoundingClientRect();
      for (let i = 0; i < 60; i++) { await frame(); await frame(); el = ${find} ?? el; const n = el.getBoundingClientRect();
        const top = document.elementFromPoint(n.left + n.width / 2, n.top + n.height / 2);
        if (n.left === b.left && n.top === b.top && n.width === b.width && el.contains(top)) break; b = n }
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }`)
    if (!r) throw new Error(`no element ${selector}${text === undefined ? '' : ` with text "${text}"`}`)
    return r
  }
  const click = async (selector, text, { button = 'left' } = {}) => {
    const { x, y } = await point(selector, text)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 })
  }
  const MODS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }
  const CODES = {
    Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], Tab: ['Tab', 9], Backspace: ['Backspace', 8], Delete: ['Delete', 46],
    ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], F10: ['F10', 121], ' ': ['Space', 32, ' ']
  }
  const key = async (k, mods = []) => {
    const modifiers = mods.reduce((a, m) => a | MODS[m], 0)
    const [code, keyCode, plain] = CODES[k] ?? (/^[a-z]$/i.test(k) ? [`Key${k.toUpperCase()}`, k.toUpperCase().charCodeAt(0), k] : /^\d$/.test(k) ? [`Digit${k}`, k.charCodeAt(0), k] : [k, 0, k])
    const text = modifiers & (MODS.Meta | MODS.Control | MODS.Alt) ? undefined : plain
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: keyCode, modifiers, text, unmodifiedText: text })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode, modifiers })
  }
  const typeKeys = async (text) => {
    for (const ch of text) await key(ch)
  }
  const size = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 0, mobile: false })
  return { send, js, waitFor, click, key, typeKeys, size, errors, close: () => ws.close() }
}
