import { useMemo, useState } from 'react'
import { Building2, Search as SearchIcon } from 'lucide-react'
import { VerificationTable } from '../../components/admin/VerificationTable'
import { RejectDialog } from '../../components/admin/RejectDialog'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAsync } from '../../hooks/useAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { adminApi } from '../../api'
import { cn } from '../../lib/cn'

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'verified', label: 'Verified', match: (o) => o.verification === 'verified' },
  { id: 'pending', label: 'Pending', match: (o) => o.verification === 'pending' },
  { id: 'suspended', label: 'Suspended', match: (o) => o.verification === 'suspended' },
  { id: 'rejected', label: 'Rejected', match: (o) => o.verification === 'rejected' },
]

export default function Organizations() {
  const { data: orgs, loading, error, run } = useAsync(() => adminApi.listOrganizations('all'), [])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)
  const [busyId, setBusyId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejecting, setRejecting] = useState(false)

  const counts = useMemo(() => {
    const list = orgs || []
    return Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.match).length]))
  }, [orgs])

  const visible = useMemo(() => {
    const list = orgs || []
    const q = debounced.trim().toLowerCase()
    return list
      .filter(FILTERS.find((x) => x.id === filter).match)
      .filter((o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        o.area?.toLowerCase().includes(q) ||
        o.license?.toLowerCase().includes(q),
      )
  }, [orgs, filter, debounced])

  async function approve(org) {
    setBusyId(org.id)
    try {
      await adminApi.approve(org.id)
      await run()
    } finally {
      setBusyId(null)
    }
  }

  async function submitReject(reason) {
    setRejecting(true)
    try {
      await adminApi.reject(rejectTarget.id, reason)
      await run()
      setRejectTarget(null)
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Building2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Organizations</h1>
          <p className="mt-1 text-sm text-slate-500">Every hospital, pharmacy and supplier on the network.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter organizations">
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
            placeholder="Search name, area, license…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={SearchIcon}
            aria-label="Search organizations"
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
        ) : visible.length ? (
          <VerificationTable
            orgs={visible}
            busyId={busyId}
            onApprove={approve}
            onReject={setRejectTarget}
            detailsToFor={(o) => `/admin/organizations/${o.id}`}
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="No organizations match"
            description="Try a different filter or search term."
          />
        )}
      </Card>

      <RejectDialog
        open={!!rejectTarget}
        org={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={submitReject}
        submitting={rejecting}
      />
    </div>
  )
}
