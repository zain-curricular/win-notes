/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface Window {
  appInfo: {
    platform: string
    material: 'vibrancy' | 'mica' | 'none'
    version: string
  }
  deepLinks?: {
    take: () => Promise<string | null>
    on: (cb: (url: string) => void) => () => void
  }
  updates?: {
    check: () => Promise<{ version: string; url: string } | null>
  }
  windowZoom?: {
    set: (factor: number) => void
    onMenu: (cb: (direction: 1 | -1 | 0) => void) => () => void
  }
}
