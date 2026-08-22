import { ClipboardList, Boxes, ShieldCheck, Truck, Activity } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const ICONS = {
  order: { icon: ClipboardList, tone: 'bg-brand-50 text-brand-600' },
  stock: { icon: Boxes, tone: 'bg-teal-50 text-teal-600' },
  verification: { icon: ShieldCheck, tone: 'bg-success-50 text-success-600' },
  delivery: { icon: Truck, tone: 'bg-slate-100 text-slate-500' },
}

/** Chronological network activity feed for the admin monitoring views. */
export function ActivityFeed({ items = [], emptyLabel = 'No recent activity.' }) {
  if (!items.length) {
    return <EmptyState icon={Activity} title="Nothing yet" description={emptyLabel} />
  }
  return (
    <ul className="space-y-1">
      {items.map((a) => {
        const meta = ICONS[a.type] || ICONS.delivery
        const Icon = meta.icon
        return (
          <li key={a.id} className="flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50">
            <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700">{a.text}</p>
              <p className="text-xs text-slate-400">{timeAgo(a.at)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
