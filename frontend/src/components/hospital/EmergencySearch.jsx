import { useEffect, useId, useRef, useState } from 'react'
import { Search, Loader2, Pill, CornerDownLeft } from 'lucide-react'
import { hospitalsApi } from '../../api'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { CATEGORIES } from '../../data/medicines'
import { PriorityToggle } from './PriorityToggle'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

/**
 * Emergency search combobox: type a medicine/equipment name, pick from live
 * suggestions, set quantity + priority, and submit. Keyboard-navigable
 * (↑/↓/Enter/Esc) and self-contained — the parent just handles `onSubmit`.
 */
export function EmergencySearch({
  defaultQuery = '',
  defaultQuantity = 20,
  defaultPriority = 'critical',
  onSubmit,
  autoFocus = false,
  className,
}) {
  const listId = useId()
  const boxRef = useRef(null)

  const [query, setQuery] = useState(defaultQuery)
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const [quantity, setQuantity] = useState(defaultQuantity)
  const [priority, setPriority] = useState(defaultPriority)

  const debounced = useDebouncedValue(query, 250)

  useEffect(() => {
    const q = debounced.trim()
    if (!q || (selected && q === selected.name)) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    hospitalsApi
      .searchCatalog(q)
      .then((r) => {
        if (cancelled) return
        setResults(r)
        setActive(r.length ? 0 : -1)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [debounced, selected])

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(medicine) {
    setSelected(medicine)
    setQuery(medicine.name)
    setOpen(false)
    setResults([])
  }

  function submit() {
    const medicine = selected || results[active] || results[0] || null
    if (medicine && medicine !== selected) setSelected(medicine)
    onSubmit?.(medicine, { query: query.trim(), quantity: Number(quantity) || 1, priority })
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && results[active]) choose(results[active])
      else submit()
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && (loading || results.length > 0)

  return (
    <div className={cn('w-full', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Combobox */}
        <div ref={boxRef} className="relative flex-1">
          <label htmlFor={`${listId}-input`} className="mb-1.5 block text-sm font-medium text-slate-700">
            Medicine or equipment
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id={`${listId}-input`}
              type="text"
              autoFocus={autoFocus}
              value={query}
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
              placeholder="Search e.g. Adrenaline, Oxygen, O- blood…"
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected(null)
                setOpen(true)
              }}
              onFocus={() => query && setOpen(true)}
              onKeyDown={onKeyDown}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-10 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 size-5 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />
            )}
          </div>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg animate-scale-in origin-top"
            >
              {loading && results.length === 0 && (
                <li className="px-4 py-3 text-sm text-slate-500">Searching…</li>
              )}
              {results.map((m, i) => (
                <li key={m.id} role="option" id={`${listId}-opt-${i}`} aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(m)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left',
                      i === active ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Pill className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{m.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {m.generic} · {m.form}
                      </span>
                    </span>
                    <span className="hidden shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 sm:inline">
                      {CATEGORIES[m.category]?.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quantity */}
        <div className="w-full sm:w-28">
          <label htmlFor={`${listId}-qty`} className="mb-1.5 block text-sm font-medium text-slate-700">
            Quantity
          </label>
          <input
            id={`${listId}-qty`}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>

        <Button size="lg" leftIcon={Search} onClick={submit} className="h-12 sm:w-auto" fullWidth>
          Find Suppliers
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Priority</span>
          <PriorityToggle value={priority} onChange={setPriority} />
        </div>
        <p className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
          <CornerDownLeft className="size-3.5" aria-hidden="true" />
          Press Enter to search
        </p>
      </div>
    </div>
  )
}
