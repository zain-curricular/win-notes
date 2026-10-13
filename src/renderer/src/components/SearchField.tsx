import { useEffect, useRef, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../lib/store'

/** Toolbar search across all notes; Cmd/Ctrl-F focuses whichever one is on screen. */
export function SearchField(): ReactNode {
  const ref = useRef<HTMLInputElement>(null)
  const search = useStore((s) => s.search)
  const setSearch = useStore.getState().setSearch

  useEffect(() => {
    const focus = (): void => {
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('notes:focus-search', focus)
    return () => window.removeEventListener('notes:focus-search', focus)
  }, [])

  return (
    <label className={`search-field${search ? ' has-text' : ''}`}>
      <Search size={14} />
      <input
        ref={ref}
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSearch('')
            e.currentTarget.blur()
          }
        }}
      />
      {search ? (
        <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
          <X size={12} />
        </button>
      ) : null}
    </label>
  )
}
