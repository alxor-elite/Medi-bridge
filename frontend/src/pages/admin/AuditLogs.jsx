import { useMemo, useState } from 'react'
import { ScrollText, ShieldCheck, AlertTriangle, ClipboardList, Cpu } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAsync } from '../../hooks/useAsync'
import { adminApi } from '../../api'
import { timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const TYPE_META = {
  verification: { icon: ShieldCheck, tone: 'bg-success-50 text-success-600', label: 'Verification' },
  compliance: { icon: AlertTriangle, tone: 'bg-warning-50 text-warning-600', label: 'Compliance' },
  order: { icon: ClipboardList, tone: 'bg-brand-50 text-brand-600', label: 'Order' },
  system: { icon: Cpu, tone: 'bg-slate-100 text-slate-500', label: 'System' },
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'verification', label: 'Verification' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'order', label: 'Orders' },
  { id: 'system', label: 'System' },
]

export default function AuditLogs() {
  const { data: logs, loading, error, run } = useAsync(() => adminApi.getAuditLogs(), [])
  const [filter, setFilter] = useState('all')

  const counts = useMemo(() => {
    const list = logs || []
    return {
      all: list.length,
      ...Object.fromEntries(
        FILTERS.slice(1).map((f) => [f.id, list.filter((l) => l.type === f.id).length]),
      ),
    }
  }, [logs])

  const visible = useMemo(() => {
    const list = logs || []
    return filter === 'all' ? list : list.filter((l) => l.type === filter)
  }, [logs, filter])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ScrollText className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit log</h1>
          <p className="mt-1 text-sm text-slate-500">Verification decisions and network events, most recent first.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter audit log">
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

      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={run} />
        ) : !visible.length ? (
          <EmptyState
            icon={ScrollText}
            title="No entries"
            description="Nothing has been logged for this category yet."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((log) => {
              const meta = TYPE_META[log.type] || TYPE_META.system
              const Icon = meta.icon
              return (
                <li key={log.id} className="flex gap-3 px-4 py-3.5">
                  <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{log.actor}</span>{' '}
                      {log.action}{' '}
                      <span className="font-medium text-slate-900">{log.target}</span>
                    </p>
                    {log.note && <p className="mt-0.5 text-xs text-slate-500">{log.note}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(log.at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
