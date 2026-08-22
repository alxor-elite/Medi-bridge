import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Search } from 'lucide-react'
import { HospitalOrderCard } from '../../components/hospital/HospitalOrderCard'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { ordersApi } from '../../api'
import { cn } from '../../lib/cn'

const ACTIVE = ['requested', 'accepted', 'preparing', 'dispatched', 'out_for_delivery']

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'Active', match: (o) => ACTIVE.includes(o.status) },
  { id: 'delivered', label: 'Delivered', match: (o) => o.status === 'delivered' },
  { id: 'closed', label: 'Rejected / Cancelled', match: (o) => ['rejected', 'cancelled'].includes(o.status) },
]

export default function Orders() {
  const { user } = useAuth()
  const orgId = user?.orgId || null
  const { data: orders, loading, error, run } = useAsync(() => ordersApi.listForHospital(orgId), [orgId])
  const [filter, setFilter] = useState('all')

  const counts = useMemo(() => {
    const list = orders || []
    return Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.match).length]))
  }, [orders])

  const visible = useMemo(() => {
    const list = orders || []
    const f = FILTERS.find((x) => x.id === filter)
    return list.filter(f.match)
  }, [orders, filter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My orders</h1>
          <p className="mt-1 text-sm text-slate-500">Track and review your emergency procurement orders.</p>
        </div>
        <Link to="/hospital/search"><Button leftIcon={Search}>New search</Button></Link>
      </div>

      {/* Filters */}
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
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  filter === f.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {counts[f.id] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : error ? (
        <Card><ErrorState onRetry={run} /></Card>
      ) : visible.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((o) => <HospitalOrderCard key={o.id} order={o} />)}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={filter === 'all' ? 'No orders yet' : 'Nothing here'}
            description={
              filter === 'all'
                ? 'Search for supplies and place your first emergency order.'
                : 'No orders match this filter right now.'
            }
            action={filter === 'all' ? <Link to="/hospital/search"><Button leftIcon={Search}>Start a search</Button></Link> : undefined}
          />
        </Card>
      )}
    </div>
  )
}
