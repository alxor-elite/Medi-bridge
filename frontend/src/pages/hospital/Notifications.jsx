import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Truck,
  ClipboardCheck,
  Boxes,
  ShieldCheck,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useAsync } from '../../hooks/useAsync'
import { hospitalsApi } from '../../api'
import { timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const TYPE_META = {
  delivery: { icon: Truck, tone: 'text-brand-600 bg-brand-50' },
  order: { icon: ClipboardCheck, tone: 'text-brand-600 bg-brand-50' },
  stock: { icon: Boxes, tone: 'text-warning-700 bg-warning-50' },
  verification: { icon: ShieldCheck, tone: 'text-success-600 bg-success-50' },
  system: { icon: AlertTriangle, tone: 'text-slate-600 bg-slate-100' },
}

export default function Notifications() {
  const { data: items, loading, error, run, setData } = useAsync(() => hospitalsApi.getNotifications(), [])
  const [tab, setTab] = useState('all')

  const unread = useMemo(() => (items || []).filter((n) => !n.read).length, [items])
  const visible = useMemo(() => {
    const list = items || []
    return tab === 'unread' ? list.filter((n) => !n.read) : list
  }, [items, tab])

  const markAllRead = () => setData((items || []).map((n) => ({ ...n, read: true })))
  const markRead = (id) => setData((items || []).map((n) => (n.id === id ? { ...n, read: true } : n)))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" leftIcon={CheckCheck} onClick={markAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : error ? (
        <Card><ErrorState onRetry={run} /></Card>
      ) : visible.length ? (
        <Card className="divide-y divide-slate-100">
          {visible.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.system
            const Icon = meta.icon
            return (
              <Link
                key={n.id}
                to={n.href || '#'}
                onClick={() => markRead(n.id)}
                className={cn(
                  'flex items-start gap-3 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50',
                  !n.read && 'bg-brand-50/40',
                )}
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{timeAgo(n.at)}</p>
                </div>
              </Link>
            )
          })}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Bell}
            title={tab === 'unread' ? 'No unread notifications' : 'No notifications'}
            description="Order updates and stock alerts will appear here."
          />
        </Card>
      )}
    </div>
  )
}
