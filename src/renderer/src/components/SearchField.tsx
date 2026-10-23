import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { CaseSensitive, Regex, Search, WholeWord, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { buildMatcher, type SearchOptions } from '../lib/searchQuery'
import { shortcuts, type SearchShortcutId } from '../lib/shortcuts'

const TOGGLES: { option: keyof SearchOptions; shortcut: SearchShortcutId; label: string; icon: ReactNode }[] = [
  { option: 'matchCase', shortcut: 'matchCase', label: 'Match Case', icon: <CaseSensitive size={15} /> },
  { option: 'wholeWord', shortcut: 'matchWholeWord', label: 'Match Whole Word', icon: <WholeWord size={15} /> },
  { option: 'regex', shortcut: 'useRegex', label: 'Use Regular Expression', icon: <Regex size={14} /> }
]

/** Toolbar search across all notes; Cmd/Ctrl-F focuses whichever one is on screen. */
export function SearchField(): ReactNode {
  const ref = useRef<HTMLInputElement>(null)
  const search = useStore((s) => s.search)
  const options = useStore((s) => s.searchOptions)
  const { setSearch, setSearchOptions } = useStore.getState()
  const matcher = useMemo(() => (search.trim() ? buildMatcher(search, options) : null), [search, options])
  const error = matcher && !matcher.ok ? matcher.error : null
  const anyOption = TOGGLES.some((t) => options[t.option])

  useEffect(() => {
    const focus = (): void => {
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('notes:focus-search', focus)
    return () => window.removeEventListener('notes:focus-search', focus)
  }, [])

  return (
    <label
      className={`search-field${search ? ' has-text' : ''}${anyOption ? ' has-options' : ''}${error ? ' invalid' : ''}`}
      title={error ?? undefined}
    >
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
            return
          }
          const toggle = TOGGLES.find((t) => shortcuts.matches(e, t.shortcut))
          if (toggle) {
            e.preventDefault()
            setSearchOptions({ [toggle.option]: !options[toggle.option] })
          }
        }}
      />
      {search ? (
        <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
          <X size={12} />
        </button>
      ) : null}
      <span className="search-options">
        {TOGGLES.map((t) => (
          <button
            key={t.option}
            className={options[t.option] ? 'on' : ''}
            title={`${t.label} (${shortcuts.label(t.shortcut)})`}
            aria-label={t.label}
            aria-pressed={options[t.option]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSearchOptions({ [t.option]: !options[t.option] })}
          >
            {t.icon}
          </button>
        ))}
      </span>
    </label>
  )
}
