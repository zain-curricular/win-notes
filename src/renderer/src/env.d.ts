/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

/** `manual` is true when the person asked for the check, so "up to date" and errors are shown too. */
type UpdateStatus = import('../../main/updates').UpdateState & { manual: boolean }

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
    state: () => Promise<UpdateStatus | null>
    check: () => Promise<void>
    apply: () => Promise<void>
    onChange: (cb: (state: UpdateStatus) => void) => () => void
  }
  windowZoom?: {
    set: (factor: number) => void
    onMenu: (cb: (direction: 1 | -1 | 0) => void) => () => void
  }
  vault?: {
    status: (accountId: string) => Promise<VaultResult<import('../../main/vaultService').VaultStatus>>
    create: (accountId: string, password: string) => Promise<VaultResult<void>>
    unlock: (accountId: string, password: string) => Promise<VaultResult<void>>
    lock: () => Promise<VaultResult<void>>
    list: () => Promise<VaultResult<import('../../main/vaultService').EntrySummary[]>>
    reveal: (id: string) => Promise<VaultResult<import('../../main/vault').VaultEntry>>
    save: (entry: import('../../main/vaultService').EntryInput) => Promise<VaultResult<import('../../main/vaultService').EntrySummary[]>>
    remove: (id: string) => Promise<VaultResult<import('../../main/vaultService').EntrySummary[]>>
    copy: (id: string) => Promise<VaultResult<void>>
    changePassword: (current: string, next: string) => Promise<VaultResult<void>>
    touch: () => Promise<VaultResult<void>>
    onLocked: (cb: () => void) => () => void
  }
}

type VaultResult<T> = import('../../main/vaultService').VaultResult<T> | { ok: false; code: 'refused' }
