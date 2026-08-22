import { useMemo, useState } from 'react'
import { ClipboardList, Building2, ArrowRight, Search as SearchIcon } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { OrderStatusBadge, PriorityBadge } from '../../components/common/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { adminApi } from '../../api'
import { formatCurrency, timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const CLOSED = ['delivered', 'rejected', 'cancelled']

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'Active', match: (o) => !CLOSED.includes(o.status) },
  { id: 'critical', label: 'Critical', match: (o) => o.priority === 'critical' && !CLOSED.includes(o.status) },
  { id: 'delivered', label: 'Delivered', match: (o) => o.status === 'delivered' },
]

export default function OrderMonitoring() {
  const { data: orders, loading, error, run } = useAsync(() => adminApi.listAllOrders(), [])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)

  const counts = useMemo(() => {
    const list = orders || []
    return Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.match).length]))
  }, [orders])

  const visible = useMemo(() => {
    const list = orders || []
    const q = debounced.trim().toLowerCase()
    return list
      .filter(FILTERS.find((x) => x.id === filter).match)
      .filter((o) =>
        !q ||
        o.code.toLowerCase().includes(q) ||
        o.hospital?.name.toLowerCase().includes(q) ||
        o.supplier?.name.toLowerCase().includes(q),
      )
  }, [orders, filter, debounced])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ClipboardList className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order monitoring</h1>
          <p className="mt-1 text-sm text-slate-500">Every emergency order moving across the network.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter orders">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === f.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {f.label}
              {!loading && (
                <span className={cn('rounded-full px-1.5 text-xs', filter === f.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                  {counts[f.id] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="sm:w-64">
          <Input
            type="search"
            placeholder="Search order, hospital, supplier…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={SearchIcon}
            aria-label="Search orders"
          />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={run} />
        ) : !visible.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No orders match"
            description="Try a different filter or search term."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Value</th>
                    <th className="px-4 py-3 text-right font-medium">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((o) => (
                    <tr key={o.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">{o.code}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="truncate">{o.hospital?.name || '—'}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="truncate">{o.supplier?.name || '—'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={o.priority} /></td>
                      <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">{formatCurrency(o.total)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{timeAgo(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 lg:hidden">
              {visible.map((o) => (
                <li key={o.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-sm font-semibold text-slate-900">{o.code}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                    <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate">{o.hospital?.name || '—'}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate">{o.supplier?.name || '—'}</span>
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <PriorityBadge priority={o.priority} />
                    <span className="text-sm font-medium tabular-nums text-slate-700">{formatCurrency(o.total)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{timeAgo(o.createdAt)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
