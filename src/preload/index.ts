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
