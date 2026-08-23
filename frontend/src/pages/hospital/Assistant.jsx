import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft, AlertTriangle, RotateCcw, Clock, Database } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { Reveal } from '../../components/ui/Reveal'
import { aiApi } from '../../api'
import { cn } from '../../lib/cn'

/**
 * AI Search — the operational query surface for MediBridge.
 *
 * A hospital asks an operational question in natural language and gets an
 * answer rendered as a result, not as a chat transcript. Queries stay in a
 * session rail so an earlier answer can be brought back without re-running it.
 *
 * The API contract is untouched: `aiApi.chat` posts { message } to /chat and
 * returns `data.response`. Everything below is presentation.
 *
 * On structure: the service answers in prose, so the figures shown in the
 * summary strip are extracted from that prose and nothing else. No inventory
 * is inferred, joined against local data, or invented — if a value is not
 * literally in the response, no cell is rendered for it.
 */

/** Page accent. Scoped to this route; the global design system is unchanged. */
const ACCENT = '#27187e'
const CANVAS = '#f7f7f7'

const SUGGESTIONS = [
  'Low stock medicines',
  'Adrenaline availability',
  'Find suppliers',
  'Track an order',
]

const EXAMPLES = [
  'Do we have adrenaline?',
  'Show medicines running low',
  'Which suppliers have insulin available?',
  'Where is order MB-DEMO-0001?',
]

/* ------------------------------------------------------------------ *
 * Extraction — literal values only, read straight out of the answer.
 * ------------------------------------------------------------------ */

const STATUS_PATTERNS = [
  { re: /\bout of stock\b/i, label: 'Out of stock', tone: 'danger' },
  { re: /\b(low stock|running low|below threshold)\b/i, label: 'Low stock', tone: 'warning' },
  { re: /\b(in transit|out for delivery|dispatched)\b/i, label: 'In transit', tone: 'accent' },
  { re: /\bdelivered\b/i, label: 'Delivered', tone: 'success' },
  { re: /\b(available|in stock)\b/i, label: 'Available', tone: 'success' },
]

const TONE_STYLES = {
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  accent: 'bg-slate-100 text-slate-700 ring-slate-200',
}

/** Pulls the quantity, status, product and order code out of the answer text. */
function extractFacts(text) {
  const facts = {}

  const quantity = text.match(/(\d[\d,]*)\s*(units?|vials?|boxes|packs?|cylinders?)\b/i)
  if (quantity) {
    facts.quantity = Number(quantity[1].replace(/,/g, ''))
    facts.quantityUnit = quantity[2].toLowerCase()
  }

  const status = STATUS_PATTERNS.find((s) => s.re.test(text))
  if (status) facts.status = status

  // "adrenaline (Adrenor 1mg/ml)" -> the bracketed product name.
  const product = text.match(/\(([^)]{3,60})\)/)
  if (product) facts.product = product[1].trim()

  const order = text.match(/\b(MB-[A-Z0-9][A-Z0-9-]{2,})\b/)
  if (order) facts.orderCode = order[1]

  const price = text.match(/₹\s?[\d,]+(?:\.\d{1,2})?/)
  if (price) facts.price = price[0].replace(/\s/g, '')

  return facts
}

/**
 * Answers that enumerate items ("- Adrenor: 18 units") are shown as rows.
 * Only lines the service actually returned are listed.
 */
function extractRows(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const bulleted = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
  if (bulleted.length < 2) return []

  return bulleted.map((line) => {
    const body = line.replace(/^([-*•]|\d+[.)])\s+/, '')
    const split = body.match(/^(.+?)\s*[:—–-]\s*(.+)$/)
    return split ? { label: split[1].trim(), value: split[2].trim() } : { label: body, value: null }
  })
}

/** The prose minus any bulleted lines, so the summary is not repeated below. */
function leadParagraph(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^([-*•]|\d+[.)])\s+/.test(l))
    .join(' ')
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Assistant() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([]) // newest first
  const [activeId, setActiveId] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const active = useMemo(
    () => results.find((r) => r.id === activeId) || null,
    [results, activeId],
  )

  // ⌘K / Ctrl+K focuses the search field from anywhere on the page.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = useCallback(
    async (text) => {
      const question = text.trim()
      if (!question || searching) return

      setError(null)
      setQuery(question)
      setSearching(true)
      const startedAt = Date.now()

      try {
        const answer = await aiApi.chat(question)
        const entry = {
          id: `r-${startedAt}`,
          query: question,
          answer,
          rows: extractRows(answer),
          lead: leadParagraph(answer),
          // Facts come from the prose only: a figure lifted out of one row of a
          // list is not a headline figure for the answer as a whole.
          facts: extractFacts(leadParagraph(answer)),
          tookMs: Date.now() - startedAt,
          at: new Date(),
        }
        setResults((prev) => [entry, ...prev])
        setActiveId(entry.id)
      } catch (err) {
        setError({ query: question, message: err.message || 'The search could not be completed.' })
      } finally {
        setSearching(false)
      }
    },
    [searching],
  )

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-4rem)] sm:-mx-6 lg:-mx-8" style={{ background: CANVAS }}>
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <SearchBar
          ref={inputRef}
          value={query}
          onChange={setQuery}
          onSubmit={() => run(query)}
          onClear={() => setQuery('')}
          searching={searching}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Quick</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => run(s)}
              disabled={searching}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#27187e] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <div
          className={cn(
            'mt-6 grid gap-6',
            // The rail only earns its column once there is history to show.
            results.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_15rem]',
          )}
        >
          <section aria-live="polite" aria-busy={searching} className="min-w-0">
            {searching && <SearchingState query={query} />}
            {!searching && error && <ErrorPanel error={error} onRetry={() => run(error.query)} />}
            {!searching && !error && active && <ResultPanel result={active} />}
            {!searching && !error && !active && <EmptyState onPick={run} />}
          </section>

          <SessionRail
            results={results}
            activeId={activeId}
            onSelect={setActiveId}
            disabled={searching}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Header + search
 * ------------------------------------------------------------------ */

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">AI Search</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Search MediBridge inventory, suppliers, orders and supply availability.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success-500" />
          </span>
          <span className="text-xs font-medium text-slate-600">AI Online</span>
        </span>
      </div>
    </header>
  )
}

const SearchBar = function SearchBar({ ref, value, onChange, onSubmit, onClear, searching }) {
  const shortcut = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform)
    ? '⌘K'
    : 'Ctrl K'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      role="search"
      className="flex items-stretch gap-2"
    >
      <div className="group relative flex-1">
        <label htmlFor="ai-search" className="sr-only">
          Search MediBridge
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="ai-search"
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClear()
          }}
          disabled={searching}
          autoComplete="off"
          placeholder="Search inventory, suppliers, orders..."
          className={cn(
            'h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-20 text-sm text-slate-900',
            'placeholder:text-slate-400 transition-[border-color,box-shadow]',
            'focus:border-[#27187e] focus:outline-none focus:ring-[3px] focus:ring-[#27187e]/15',
            'disabled:bg-slate-50 disabled:text-slate-400',
          )}
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400 sm:block">
          {shortcut}
        </kbd>
      </div>

      <Button
        type="submit"
        size="lg"
        loading={searching}
        disabled={!value.trim()}
        className="shrink-0 rounded-xl px-5"
        style={{ backgroundColor: ACCENT }}
      >
        Search
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

function Panel({ className, children }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white', className)}>{children}</div>
  )
}

function EmptyState({ onPick }) {
  return (
    <Panel className="p-8">
      <h2 className="text-base font-semibold text-slate-900">Search MediBridge</h2>
      <p className="mt-1 max-w-lg text-sm text-slate-500">
        Find medicines, suppliers, inventory and orders using natural language.
      </p>

      <ul className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onPick(example)}
              className="group flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Search className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                <span className="truncate text-sm text-slate-600 group-hover:text-slate-900">
                  {example}
                </span>
              </span>
              <CornerDownLeft
                className="size-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** The service answers in ~20s, so the wait is given a visible clock. */
function SearchingState({ query }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-slate-900">{query}</p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-slate-500">
          <Clock className="size-3.5" aria-hidden="true" />
          {elapsed}s
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <p className="text-xs text-slate-400">Searching MediBridge inventory and supplier records…</p>
      </div>
    </Panel>
  )
}

function ErrorPanel({ error, onRetry }) {
  return (
    <Panel className="p-5">
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-600">
          <AlertTriangle className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Search failed</h2>
          <p className="mt-1 text-sm text-slate-600">{error.message}</p>
          <p className="mt-2 truncate text-xs text-slate-400">Query: {error.query}</p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={RotateCcw}
            onClick={onRetry}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

function ResultPanel({ result }) {
  const { query, answer, facts, rows, lead, tookMs } = result
  // A per-item summary strip alongside a multi-item list would present one
  // row's numbers as though they described the whole answer, so it is shown
  // only when the answer is about a single subject.
  const hasSummary =
    rows.length === 0 &&
    Boolean(facts.status || facts.quantity != null || facts.product || facts.orderCode || facts.price)

  return (
    <Reveal>
      <Panel className="overflow-hidden">
        {/* Query line */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="min-w-0 truncate text-sm font-medium text-slate-900">{query}</p>
          <span className="shrink-0 text-xs tabular-nums text-slate-400">
            {(tookMs / 1000).toFixed(1)}s
          </span>
        </div>

        {/* Natural-language answer, marked as the AI's own words */}
        <div className="border-l-2 px-5 py-4" style={{ borderColor: ACCENT }}>
          <p className="text-[15px] leading-relaxed text-slate-800">{lead || answer}</p>
        </div>

        {/* Structured summary — every value below appears verbatim in the answer */}
        {hasSummary && (
          // flex-wrap rather than a fixed grid: the strip fills the row whatever
          // number of facts the answer happened to contain.
          <dl className="flex flex-wrap gap-px border-t border-slate-100 bg-slate-100">
            {facts.product && <Cell label="Item" value={facts.product} />}
            {facts.quantity != null && (
              <Cell
                label="Quantity"
                value={
                  <span style={{ color: ACCENT }}>
                    {/* Rendered outright, not counted up: a quantity that reads
                        0 mid-animation is worse than no animation at all, and
                        rAF is throttled in background tabs. */}
                    {facts.quantity.toLocaleString('en-IN')}{' '}
                    <span className="text-sm font-medium text-slate-500">{facts.quantityUnit}</span>
                  </span>
                }
                emphasis
              />
            )}
            {facts.status && (
              <Cell
                label="Status"
                value={
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset',
                      TONE_STYLES[facts.status.tone],
                    )}
                  >
                    {facts.status.label}
                  </span>
                }
              />
            )}
            {facts.orderCode && <Cell label="Order" value={facts.orderCode} mono />}
            {facts.price && <Cell label="Price" value={facts.price} />}
          </dl>
        )}

        {/* Enumerated answers become rows */}
        {rows.length > 0 && (
          <div className="border-t border-slate-100">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={`${row.label}-${i}`} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-slate-700">{row.label}</td>
                    {row.value && (
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums text-slate-900">
                        {row.value}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5">
          <Database className="size-3.5 text-slate-400" aria-hidden="true" />
          <span className="text-xs text-slate-500">Source: MediBridge inventory</span>
        </div>
      </Panel>
    </Reveal>
  )
}

function Cell({ label, value, emphasis = false, mono = false }) {
  return (
    <div className="min-w-[9rem] flex-1 bg-white px-5 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={cn(
          'mt-1 truncate text-slate-900',
          emphasis ? 'text-xl font-semibold tabular-nums' : 'text-sm font-medium',
          mono && 'font-mono text-[13px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Session rail — earlier queries stay reachable without re-running them.
 * ------------------------------------------------------------------ */

function SessionRail({ results, activeId, onSelect, disabled }) {
  if (results.length === 0) return null

  return (
    <aside className="min-w-0">
      <h2 className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        This session
      </h2>
      <ul className="mt-2 space-y-1">
        {results.map((r) => {
          const isActive = r.id === activeId
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                disabled={disabled}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50',
                  isActive
                    ? 'border-slate-300 bg-white'
                    : 'border-transparent hover:border-slate-200 hover:bg-white',
                )}
                style={isActive ? { borderLeftColor: ACCENT, borderLeftWidth: 2 } : undefined}
              >
                <span className="block truncate text-xs font-medium text-slate-700">{r.query}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">
                  {r.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
