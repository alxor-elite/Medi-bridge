import { useMemo, useState } from 'react'
import { Siren, Building2, MapPin, Check, X, Pill, StickyNote } from 'lucide-react'
import { Card, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { PriorityBadge } from '../../components/common/Badges'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { suppliersApi } from '../../api'
import { formatNumber, timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const STATUS_BADGE = {
  new: { variant: 'warning', label: 'New', icon: Siren },
  accepted: { variant: 'success', label: 'Accepted', icon: Check },
  declined: { variant: 'neutral', label: 'Declined', icon: X },
}

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'new', label: 'New', match: (r) => r.status === 'new' },
  { id: 'responded', label: 'Responded', match: (r) => r.status !== 'new' },
]

function RequestCard({ request, busy, onRespond }) {
  const meta = STATUS_BADGE[request.status] || STATUS_BADGE.new
  const isNew = request.status === 'new'
  return (
    <Card className={cn('p-5', isNew && 'border-danger-200')} hover>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{request.code}</span>
            <PriorityBadge priority={request.priority} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
            <Building2 className="size-4 text-slate-400" aria-hidden="true" />
            {request.from?.name || 'Hospital'}
            {request.from?.area && (
              <>
                <span aria-hidden="true">·</span>
                <MapPin className="size-3.5 text-slate-400" aria-hidden="true" />
                {request.from.area}
              </>
            )}
          </p>
        </div>
        <Badge variant={meta.variant} icon={meta.icon}>{meta.label}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
        <Pill className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-900">{request.name}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-slate-700">×{formatNumber(request.qty)}</span>
      </div>

      {request.note && (
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
          {request.note}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">{timeAgo(request.at)}</span>
        {isNew && (
          <div className="flex gap-2">
            <Button variant="outlineDanger" size="sm" disabled={busy} onClick={() => onRespond(request, 'declined')}>
              Decline
            </Button>
            <Button variant="success" size="sm" leftIcon={Check} loading={busy} onClick={() => onRespond(request, 'accepted')}>
              Accept
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function EmergencyRequests() {
  const { user } = useAuth()
  const orgId = user?.orgId || null
  const { data: requests, loading, error, run, setData } = useAsync(
    () => suppliersApi.listEmergencyRequests(orgId),
    [orgId],
  )
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const counts = useMemo(() => {
    const list = requests || []
    return Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.match).length]))
  }, [requests])

  const visible = useMemo(() => {
    const list = requests || []
    return list.filter(FILTERS.find((x) => x.id === filter).match)
  }, [requests, filter])

  async function respond(request, decision) {
    setBusyId(request.id)
    try {
      const updated = await suppliersApi.respondToRequest(request.id, decision)
      setData((requests || []).map((r) => (r.id === updated.id ? updated : r)))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Emergency requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time-critical asks from hospitals. Respond quickly to help patients get supplies.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter requests">
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
          {visible.map((r) => (
            <RequestCard key={r.id} request={r} busy={busyId === r.id} onRespond={respond} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Siren}
            title="No requests here"
            description="New emergency requests from hospitals will appear here for you to accept or decline."
          />
        </Card>
      )}
    </div>
  )
}
