import { app, BrowserWindow, clipboard, Menu, ipcMain, nativeTheme, net, powerMonitor, session, shell } from 'electron'
import { release } from 'os'
import { join, resolve } from 'path'
import { isNewer } from './version'
import { result, VaultService, type EntryInput } from './vaultService'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
// The title bar is hidden everywhere, so Windows and Linux need Electron to draw the window buttons over the toolbar.
const hasOverlay = isWin || process.platform === 'linux'
// Windows 11 is build 22000+; Mica is only available there.
const hasMica = isWin && Number(release().split('.')[2] ?? 0) >= 22000
const TOOLBAR_HEIGHT = 52
let zoom = 1

// Testing aid: NOTES_PROFILE runs an isolated copy (its own data and single-instance lock),
// NOTES_CDP_PORT exposes the DevTools protocol for automated checks.
if (process.env.NOTES_PROFILE) app.setPath('userData', join(app.getPath('userData'), `profile-${process.env.NOTES_PROFILE}`))
if (process.env.NOTES_CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.NOTES_CDP_PORT)

let mainWindow: BrowserWindow | null = null

// Sign-up confirmation emails link back to winnotes://auth-callback?code=...
const PROTOCOL = 'winnotes'
const findLink = (argv: string[]): string | undefined => argv.find((a) => a.startsWith(`${PROTOCOL}://`))
let pendingLink: string | null = findLink(process.argv) ?? null

function handleLink(url: string | undefined): void {
  if (!url) return
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('deep-link', url)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingLink = url
    // On macOS the app keeps running with no window; open one to receive the link.
    if (!mainWindow && app.isReady()) createWindow()
  }
}

if (!process.env.NOTES_PROFILE) {
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  else app.setAsDefaultProtocolClient(PROTOCOL)
}
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleLink(url)
})

function overlayColors(): Electron.TitleBarOverlayOptions {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    color: dark ? '#1e1e1e' : '#ffffff',
    symbolColor: dark ? '#e5e5e7' : '#1d1d1f',
    height: Math.round(TOOLBAR_HEIGHT * zoom)
  }
}

// The OS draws the traffic lights at a fixed size, so they move to stay centred in the zoomed toolbar.
const trafficLightPosition = (): Electron.Point => ({ x: 18, y: Math.round((TOOLBAR_HEIGHT / 2) * zoom - 8) })

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Notes',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: trafficLightPosition(), vibrancy: 'sidebar', visualEffectState: 'followWindow' } : {}),
    ...(hasOverlay ? { titleBarOverlay: overlayColors() } : {}),
    ...(hasMica ? { backgroundMaterial: 'mica' } : {}),
    backgroundColor: isMac || hasMica ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      // Keep applying live edits from other computers while the window is in the background.
      backgroundThrottling: false
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // Links inside notes open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    }
  })

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown') vault?.touch()
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.on('closed', () => {
    mainWindow = null
    vault?.lock()
  })
}

function buildMenu(): void {
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  // App shortcuts are handled in the renderer; the menu only provides the standard macOS roles.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.send('zoom-menu', 0) },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('zoom-menu', 1) },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('zoom-menu', -1) },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      { role: 'windowMenu' }
    ])
  )
}

ipcMain.handle('take-deep-link', () => {
  const url = pendingLink
  pendingLink = null
  return url
})

const LATEST_RELEASE = 'https://api.github.com/repos/zain-curricular/win-notes/releases/latest'
const RELEASES_PAGE = 'https://github.com/zain-curricular/win-notes/releases/latest'

// Best effort: no network, GitHub rate limits or an odd reply all mean "no notice", never an error.
ipcMain.handle('check-update', async () => {
  try {
    const res = await net.fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const version = String(((await res.json()) as { tag_name?: unknown }).tag_name ?? '').replace(/^v/, '')
    return isNewer(version, app.getVersion()) ? { version, url: RELEASES_PAGE } : null
  } catch {
    return null
  }
})

ipcMain.on('set-zoom', (event, factor: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || typeof factor !== 'number' || !(factor >= 0.5 && factor <= 2)) return
  zoom = factor
  win.webContents.setZoomFactor(factor)
  if (hasOverlay) win.setTitleBarOverlay(overlayColors())
  if (isMac) win.setWindowButtonPosition(trafficLightPosition())
})

let vault: VaultService | null = null

// Only the app's own page may reach the vault: not a navigated frame, not another window.
const fromApp = (event: Electron.IpcMainInvokeEvent): boolean =>
  !!mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame

function handleVault<A extends unknown[], T>(channel: string, call: (v: VaultService, ...args: A) => T | Promise<T>): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!vault || !fromApp(event)) return { ok: false, code: 'refused' }
    return result(() => call(vault!, ...(args as A)))
  })
}

handleVault('vault:status', (v, accountId: string) => v.status(accountId))
handleVault('vault:create', (v, accountId: string, password: string) => v.create(accountId, password))
handleVault('vault:unlock', (v, accountId: string, password: string) => v.unlock(accountId, password))
handleVault('vault:lock', (v) => v.lock())
handleVault('vault:list', (v) => v.list())
handleVault('vault:reveal', (v, id: string) => v.reveal(id))
handleVault('vault:save', (v, entry: EntryInput) => v.save(entry))
handleVault('vault:remove', (v, id: string) => v.remove(id))
handleVault('vault:copy', (v, id: string) => v.copyPassword(id))
handleVault('vault:change-password', (v, current: string, next: string) => v.changePassword(current, next))
handleVault('vault:touch', (v) => v.touch())

ipcMain.on('app-info', (event) => {
  event.returnValue = {
    platform: process.platform,
    material: isMac ? 'vibrancy' : hasMica ? 'mica' : 'none',
    version: app.getVersion()
  }
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const link = findLink(argv)
    if (link) return handleLink(link)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    if (isWin) app.setAppUserModelId('com.winnotes.app')
    // Electron grants every permission by default. Notes needs none of camera, microphone, location or notifications.
    // Copy as Markdown writes rich text with navigator.clipboard.write, which Electron 44 checks as clipboard-read.
    const CLIPBOARD = new Set(['clipboard-read', 'clipboard-sanitized-write'])
    const allowed = (permission: string): boolean => CLIPBOARD.has(permission)
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed(permission)))
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed(permission))
    vault = new VaultService({ dir: app.getPath('userData'), clipboard, onLock: () => mainWindow?.webContents.send('vault-locked') })
    powerMonitor.on('lock-screen', () => vault?.lock())
    powerMonitor.on('suspend', () => vault?.lock())
    buildMenu()
    createWindow()
    nativeTheme.on('updated', () => {
      if (hasOverlay && mainWindow) mainWindow.setTitleBarOverlay(overlayColors())
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
  app.on('before-quit', () => vault?.lock())
}
