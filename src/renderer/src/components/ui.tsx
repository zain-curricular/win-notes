import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight } from 'lucide-react'
import { create } from 'zustand'

export const pop = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -2 },
  transition: { duration: 0.14, ease: [0.2, 0.8, 0.2, 1] as const }
}

// Menus and popovers take focus only when opened from the keyboard, so a mouse user's cursor stays in the note.
let keyboardOpened = false
window.addEventListener('keydown', () => (keyboardOpened = true), true)
window.addEventListener('pointerdown', () => (keyboardOpened = false), true)

const FOCUSABLE = 'button:not(:disabled), [role="menuitem"]:not(.disabled), input, [tabindex="0"]'

function focusFirst(root: HTMLElement | null): boolean {
  const el = root?.querySelector<HTMLElement>(FOCUSABLE)
  el?.focus()
  return !!el
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

export function MenuList({ items, onClose, onBack }: { items: MenuItem[]; onClose: () => void; onBack?: () => void }): ReactNode {
  const [openSub, setOpenSub] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const rows = (): HTMLElement[] => [...(ref.current?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]:not(.disabled)') ?? [])]
  const actionable = items.filter((x): x is Exclude<MenuItem, 'separator'> => x !== 'separator' && !x.disabled)

  useEffect(() => {
    if (onBack) focusFirst(ref.current)
  }, [onBack])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const list = rows()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (at === -1) return
    const item = actionable[at]
    const move = (to: number): void => list[(to + list.length) % list.length]?.focus()
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(list.length - 1)
    else if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && item?.submenu) setOpenSub(items.indexOf(item))
    else if (e.key === 'Enter' || e.key === ' ') list[at].click()
    else if (e.key === 'ArrowLeft' && onBack) onBack()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="menu" role="menu" ref={ref} onKeyDown={onKeyDown}>
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={`menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${openSub === i ? ' sub-open' : ''}`}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? openSub === i : undefined}
            aria-checked={item.checked === undefined ? undefined : item.checked}
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
                  <MenuList
                    items={item.submenu}
                    onClose={onClose}
                    onBack={keyboardOpened ? () => (setOpenSub(null), rows()[actionable.indexOf(item)]?.focus()) : undefined}
                  />
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

export function openContextMenu(e: React.MouseEvent | React.KeyboardEvent, items: MenuItem[]): void {
  e.preventDefault()
  e.stopPropagation()
  if ('clientX' in e) return openContextMenuAt(e.clientX, e.clientY, items)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openContextMenuAt(r.left + 16, r.bottom - 4, items)
}

export function openContextMenuAt(x: number, y: number, items: MenuItem[]): void {
  useContextMenuStore.getState().set({ x, y, items })
}

export const isContextMenuKey = (e: React.KeyboardEvent): boolean => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')

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
    const before = document.activeElement as HTMLElement | null
    const close = (): void => set(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !ref.current?.contains(document.activeElement)) {
        e.preventDefault()
        focusFirst(ref.current)
      }
    }
    if (keyboardOpened) requestAnimationFrame(() => focusFirst(ref.current))
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      if (ref.current?.contains(document.activeElement) || document.activeElement === document.body) before?.focus()
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
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null)
  // Callers pass a new onClose on every render; the open/close effect must run once per opening.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const a = anchor.current.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 240
    const h = ref.current?.offsetHeight ?? 0
    let left = align === 'end' ? a.right - w : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    // Open upward when there is no room below (e.g. the account button at the bottom of the sidebar).
    const up = a.bottom + 6 + h > window.innerHeight - 8 && a.top - 6 - h >= 8
    setPos({ left, top: up ? a.top - 6 - h : a.bottom + 6, up })
  }, [open, anchor, align])

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const onClose = (): void => closeRef.current()
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown' && !ref.current?.contains(document.activeElement)) {
        e.preventDefault()
        focusFirst(ref.current)
      }
    }
    if (keyboardOpened) requestAnimationFrame(() => focusFirst(ref.current))
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      if (ref.current?.contains(document.activeElement) || document.activeElement === document.body) before?.focus()
    }
  }, [open, anchor])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          className={`popover ${className}`}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, transformOrigin: `${pos?.up ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` }}
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

/** Keeps Tab inside an open dialog and gives focus back to where it was when the dialog closes. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, paused = false): void {
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) focusFirst(ref.current)
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || pausedRef.current || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      if (before && document.contains(before)) before.focus()
    }
  }, [ref, open])
}
