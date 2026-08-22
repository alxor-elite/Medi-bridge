import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { OrderCard } from '../../components/supplier/OrderCard'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { ordersApi } from '../../api'
import { cn } from '../../lib/cn'

const IN_PROGRESS = ['accepted', 'preparing', 'dispatched', 'out_for_delivery']

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'new', label: 'New', match: (o) => o.status === 'requested' },
  { id: 'progress', label: 'In progress', match: (o) => IN_PROGRESS.includes(o.status) },
  { id: 'completed', label: 'Completed', match: (o) => ['delivered', 'rejected', 'cancelled'].includes(o.status) },
]

export default function IncomingOrders() {
  const { user } = useAuth()
  const orgId = user?.orgId || null
  const { data: orders, loading, error, run } = useAsync(() => ordersApi.listForSupplier(orgId), [orgId])
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const counts = useMemo(() => {
    const list = orders || []
    return Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.match).length]))
  }, [orders])

  const visible = useMemo(() => {
    const list = orders || []
    return list.filter(FILTERS.find((x) => x.id === filter).match)
  }, [orders, filter])

  async function advance(order, nextId) {
    setBusyId(order.id)
    try {
      await ordersApi.setStatus(order.id, nextId, null)
      await run()
    } finally {
      setBusyId(null)
    }
  }

  async function reject(order) {
    setBusyId(order.id)
    try {
      await ordersApi.setStatus(order.id, 'rejected', 'Rejected by supplier')
      await run()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Incoming orders</h1>
        <p className="mt-1 text-sm text-slate-500">Accept, prepare and dispatch hospital orders.</p>
      </div>

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

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : error ? (
        <Card><ErrorState onRetry={run} /></Card>
      ) : visible.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              busy={busyId === o.id}
              onAdvance={advance}
              onReject={reject}
              detailsTo={`/supplier/orders/${o.id}`}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Nothing here"
            description="No orders match this filter right now."
          />
        </Card>
      )}
    </div>
  )
}
