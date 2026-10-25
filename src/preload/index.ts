import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('appInfo', ipcRenderer.sendSync('app-info'))

contextBridge.exposeInMainWorld('deepLinks', {
  /** A link the app was launched with, if any (only returned once). */
  take: (): Promise<string | null> => ipcRenderer.invoke('take-deep-link'),
  /** Links opened while the app is already running. */
  on: (cb: (url: string) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on('deep-link', listener)
    return () => ipcRenderer.removeListener('deep-link', listener)
  }
})

contextBridge.exposeInMainWorld('windowZoom', {
  set: (factor: number): void => ipcRenderer.send('set-zoom', factor),
  /** Zoom In, Zoom Out or Actual Size picked from the macOS View menu: 1, -1 or 0. */
  onMenu: (cb: (direction: 1 | -1 | 0) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, direction: 1 | -1 | 0): void => cb(direction)
    ipcRenderer.on('zoom-menu', listener)
    return () => ipcRenderer.removeListener('zoom-menu', listener)
  }
})

const vaultCall =
  (channel: string) =>
  (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(`vault:${channel}`, ...args)

// The key and all cryptography stay in the main process; the page only ever sees what it asks for while unlocked.
contextBridge.exposeInMainWorld('vault', {
  status: vaultCall('status'),
  create: vaultCall('create'),
  unlock: vaultCall('unlock'),
  lock: vaultCall('lock'),
  list: vaultCall('list'),
  reveal: vaultCall('reveal'),
  save: vaultCall('save'),
  remove: vaultCall('remove'),
  copy: vaultCall('copy'),
  changePassword: vaultCall('change-password'),
  touch: vaultCall('touch'),
  /** The vault locked itself (inactivity, sleep, screen lock); anything shown must go. */
  onLocked: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('vault-locked', listener)
    return () => ipcRenderer.removeListener('vault-locked', listener)
  }
})

contextBridge.exposeInMainWorld('updates', {
  /** The newer release on GitHub, if there is one. */
  check: (): Promise<{ version: string; url: string } | null> => ipcRenderer.invoke('check-update')
})
