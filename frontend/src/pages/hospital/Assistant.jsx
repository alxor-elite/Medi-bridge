import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  SearchX,
  CornerDownLeft,
  AlertTriangle,
  RotateCcw,
  Clock,
  Database,
  ArrowUpRight,
} from 'lucide-react'
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
    const label = (split ? split[1] : body).trim()
    const value = split ? split[2].trim() : null

    // Pull the figures the line states so the list can be columned. Anything
    // absent stays absent - the column is dropped rather than guessed at.
    const available = value?.match(/(\d[\d,]*)\s*(units?|vials?|boxes|packs?|cylinders?)\b/i)
    const threshold = value?.match(/threshold\s*(?:of\s*)?(\d[\d,]*)/i)

    const toNum = (m, i = 1) => (m ? Number(m[i].replace(/,/g, '')) : null)

    return {
      label,
      value,
      available: toNum(available),
      availableUnit: available ? available[2].toLowerCase() : null,
      threshold: toNum(threshold),
    }
  })
}

/**
 * Status for a row, from arithmetic on the two figures the answer itself
 * stated. Nothing is derived when either number is missing.
 */
function rowStatus(row) {
  if (row.available == null) return null
  if (row.available === 0) return { label: 'Out', tone: 'danger' }
  if (row.threshold == null) return null
  return row.available < row.threshold
    ? { label: 'Low', tone: 'warning' }
    : { label: 'OK', tone: 'success' }
}

/**
 * True when the answer reports an absence. Deliberately narrow: it must both
 * read as a negative and carry no quantity, so "we have 0 units" or a normal
 * positive answer is never mistaken for an empty result.
 */
const NEGATIVE = /\b(no|not|none|n't|unable|cannot|couldn't|could not)\b[^.]{0,40}\b(match|found|find|have|available|stock|record|result|suppl|order)/i

function isNoResult(text, facts, rows) {
  if (rows.length > 0 || facts.quantity != null) return false
  return NEGATIVE.test(text)
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
          empty: false,
          tookMs: Date.now() - startedAt,
          at: new Date(),
        }
        entry.empty = isNoResult(answer, entry.facts, entry.rows)
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

/** Question words stripped, so the panel is titled by its subject. */
function subjectOf(result) {
  if (result.facts.product) return result.facts.product
  if (result.facts.orderCode) return result.facts.orderCode
  const cleaned = result.query
    .replace(/^\s*(do|does|did)\s+we\s+have\s+/i, '')
    .replace(/^\s*(show|find|list|get|track|search( for)?)\s+(me\s+)?/i, '')
    .replace(/^\s*(where\s+is|what\s+is|which|who|how\s+much|how\s+many|is\s+there|are\s+there)\s+/i, '')
    .replace(/\?+\s*$/, '')
    .trim()
  return cleaned || result.query
}

function ResultPanel({ result }) {
  const { query, answer, facts, rows, lead, tookMs, empty } = result
  // A per-item summary strip alongside a multi-item list would present one
  // row's numbers as though they described the whole answer, so it is shown
  // only when the answer is about a single subject.
  const hasSummary =
    rows.length === 0 &&
    Boolean(facts.status || facts.quantity != null || facts.product || facts.orderCode || facts.price)

  const subject = subjectOf(result)

  return (
    <Reveal>
      <Panel className="overflow-hidden">
        {/* Subject leads; the query it came from stays visible but secondary. */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-slate-900">
              {subject}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">{query}</p>
          </div>
          <span className="shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">
            {(tookMs / 1000).toFixed(1)}s
          </span>
        </div>

        {empty ? (
          <NoResults answer={lead || answer} />
        ) : (
          <>
            {/* Natural-language answer, marked as the AI's own words */}
            <div className="border-l-2 px-5 py-4" style={{ borderColor: ACCENT }}>
              <p className="text-[15px] leading-relaxed text-slate-800">{lead || answer}</p>
            </div>

            {/* Structured summary - every value below appears verbatim in the answer */}
            {hasSummary && (
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
                        <span className="text-sm font-medium text-slate-500">
                          {facts.quantityUnit}
                        </span>
                      </span>
                    }
                    emphasis
                  />
                )}
                {facts.status && (
                  <Cell
                    label="Status"
                    value={<StatusTag label={facts.status.label} tone={facts.status.tone} />}
                  />
                )}
                {facts.orderCode && <Cell label="Order" value={facts.orderCode} mono />}
                {facts.price && <Cell label="Price" value={facts.price} />}
              </dl>
            )}

            {rows.length > 0 && <ResultTable rows={rows} />}
          </>
        )}

        <ResultFooter facts={facts} empty={empty} />
      </Panel>
    </Reveal>
  )
}

function StatusTag({ label, tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset',
        TONE_STYLES[tone],
      )}
    >
      {label}
    </span>
  )
}

/**
 * Enumerated answers become a real table. A column appears only when at least
 * one row actually stated that figure.
 */
function ResultTable({ rows }) {
  const showAvailable = rows.some((r) => r.available != null)
  const showThreshold = rows.some((r) => r.threshold != null)
  const statuses = rows.map(rowStatus)
  const showStatus = statuses.some(Boolean)
  const plain = !showAvailable && !showThreshold && !showStatus
  const unit = rows.find((r) => r.availableUnit)?.availableUnit || 'units'

  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
            <Th>Medicine</Th>
            {showAvailable && <Th align="right">Available</Th>}
            {showThreshold && <Th align="right">Threshold</Th>}
            {showStatus && <Th>Status</Th>}
            {plain && <Th align="right">Detail</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} className="transition-colors hover:bg-slate-50">
              <td className="px-5 py-2.5 font-medium text-slate-900">{row.label}</td>
              {showAvailable && (
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">
                  {row.available != null ? `${row.available.toLocaleString('en-IN')} ${unit}` : '\u2014'}
                </td>
              )}
              {showThreshold && (
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">
                  {row.threshold != null ? `${row.threshold.toLocaleString('en-IN')} ${unit}` : '\u2014'}
                </td>
              )}
              {showStatus && (
                <td className="px-5 py-2.5">
                  {statuses[i] ? (
                    <StatusTag label={statuses[i].label} tone={statuses[i].tone} />
                  ) : (
                    <span className="text-slate-300">{'\u2014'}</span>
                  )}
                </td>
              )}
              {plain && <td className="px-5 py-2.5 text-right text-slate-700">{row.value || '\u2014'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  )
}

function NoResults({ answer }) {
  return (
    <div className="px-5 py-6">
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
          <SearchX className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">No matching records</p>
          <p className="mt-1 text-sm text-slate-600">{answer}</p>
          <p className="mt-2 text-xs text-slate-400">
            Try a medicine name, a supplier, or an order code such as MB-DEMO-0001.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Source line, plus a way through to the workspace that owns the record.
 * These navigate to the relevant list rather than deep-linking: the assistant
 * answers with names and codes, not the internal ids those routes need, so a
 * deep link would land on a missing record.
 */
function ResultFooter({ facts, empty }) {
  const showActions = !empty && (facts.orderCode || facts.product)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5">
      <span className="flex items-center gap-1.5">
        <Database className="size-3.5 text-slate-400" aria-hidden="true" />
        <span className="text-xs text-slate-500">Source: MediBridge inventory</span>
      </span>

      {showActions && (
        <span className="flex items-center gap-2">
          {facts.orderCode && <FooterLink to="/hospital/orders">View in orders</FooterLink>}
          {facts.product && <FooterLink to="/hospital/search">Find suppliers</FooterLink>}
        </span>
      )}
    </div>
  )
}

function FooterLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
    >
      {children}
      <ArrowUpRight className="size-3" aria-hidden="true" />
    </Link>
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
