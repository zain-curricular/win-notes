import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight } from 'lucide-react'
import { create } from 'zustand'

export const isMac = window.appInfo?.platform === 'darwin'

/** Formats a shortcut like ["Shift", "T"] as ⇧⌘T on Mac or Ctrl+Shift+T on Windows. */
export function kbd(...keys: string[]): string {
  if (isMac) {
    const map: Record<string, string> = { Shift: '⇧', Alt: '⌥', Ctrl: '⌃', Up: '↑', Down: '↓', Left: '←', Right: '→' }
    return [...keys.slice(0, -1).map((k) => map[k] ?? k), '⌘', map[keys.at(-1)!] ?? keys.at(-1)].join('')
  }
  return ['Ctrl', ...keys].join('+')
}

/** True when the platform's command key (Cmd / Ctrl) is held. */
export function isMod(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

export const pop = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -2 },
  transition: { duration: 0.14, ease: [0.2, 0.8, 0.2, 1] as const }
}

// ---------- Menus ----------

export type MenuItem =
  | {
      label: string
      icon?: ReactNode
      shortcut?: string
      onSelect?: () => void
      danger?: boolean
      disabled?: boolean
      checked?: boolean
      submenu?: MenuItem[]
    }
  | 'separator'

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }): ReactNode {
  const [openSub, setOpenSub] = useState<number | null>(null)
  return (
    <div className="menu" role="menu">
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={`menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${openSub === i ? ' sub-open' : ''}`}
            role="menuitem"
            onMouseEnter={() => setOpenSub(item.submenu ? i : null)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (item.disabled || item.submenu) return
              onClose()
              item.onSelect?.()
            }}
          >
            <span className="menu-check">{item.checked ? <Check size={13} strokeWidth={2.5} /> : null}</span>
            {item.icon ? <span className="menu-icon">{item.icon}</span> : null}
            <span className="menu-label">{item.label}</span>
            {item.shortcut ? <span className="menu-shortcut">{item.shortcut}</span> : null}
            {item.submenu ? <ChevronRight size={13} className="menu-chevron" /> : null}
            <AnimatePresence>
              {item.submenu && openSub === i ? (
                <motion.div className="submenu" {...pop} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <MenuList items={item.submenu} onClose={onClose} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      )}
    </div>
  )
}

type ContextMenuState = { x: number; y: number; items: MenuItem[] } | null
const useContextMenuStore = create<{ menu: ContextMenuState; set: (m: ContextMenuState) => void }>((set) => ({
  menu: null,
  set: (menu) => set({ menu })
}))

export function openContextMenu(e: React.MouseEvent, items: MenuItem[]): void {
  e.preventDefault()
  e.stopPropagation()
  useContextMenuStore.getState().set({ x: e.clientX, y: e.clientY, items })
}

export function ContextMenuLayer(): ReactNode {
  const { menu, set } = useContextMenuStore()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (): void => set(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, set])

  return createPortal(
    <AnimatePresence>
      {menu ? (
        <motion.div
          ref={ref}
          className="context-menu"
          style={{ left: pos.x || menu.x, top: pos.y || menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          {...pop}
        >
          <MenuList items={menu.items} onClose={() => set(null)} />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

// ---------- Popover ----------

export function Popover({
  open,
  anchor,
  onClose,
  align = 'start',
  children,
  className = ''
}: {
  open: boolean
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  align?: 'start' | 'end'
  children: ReactNode
  className?: string
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const a = anchor.current.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 240
    let left = align === 'end' ? a.right - w : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    setPos({ left, top: a.bottom + 6 })
  }, [open, anchor, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [open, onClose, anchor])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          className={`popover ${className}`}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, transformOrigin: align === 'end' ? 'top right' : 'top left' }}
          {...pop}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

export function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  buttonRef
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  buttonRef?: RefObject<HTMLButtonElement | null>
}): ReactNode {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`tool-btn${active ? ' active' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
