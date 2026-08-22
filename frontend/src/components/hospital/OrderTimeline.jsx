import { Check, X, Truck } from 'lucide-react'
import { ORDER_STATUSES, ORDER_STATUS_MAP } from '../../lib/constants'
import { formatDateTime } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * Vertical order-status timeline: Requested → Accepted → Preparing →
 * Dispatched → Out for Delivery → Delivered. Completed steps are solid,
 * the current step is emphasised (red accent for critical orders), and
 * upcoming steps are muted. Rejected/cancelled orders end in a red terminal.
 */
export function OrderTimeline({ order }) {
  const { status, priority, timeline = [] } = order
  const byStatus = Object.fromEntries(timeline.map((t) => [t.statusId, t]))
  const terminal = status === 'rejected' || status === 'cancelled'
  const currentIndex = ORDER_STATUS_MAP[status]?.index ?? -1
  const critical = priority === 'critical'

  return (
    <ol className="relative">
      {ORDER_STATUSES.map((step, i) => {
        const entry = byStatus[step.id]
        const done = !terminal && i < currentIndex
        const current = !terminal && i === currentIndex
        const isLast = i === ORDER_STATUSES.length - 1

        const dotClass = done
          ? 'bg-success-500 text-white'
          : current
            ? critical
              ? 'bg-danger-600 text-white ring-4 ring-danger-100'
              : 'bg-brand-600 text-white ring-4 ring-brand-100'
            : 'bg-white text-slate-300 border-2 border-slate-200'

        return (
          <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5',
                  done ? 'bg-success-400' : 'bg-slate-200',
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full',
                dotClass,
              )}
            >
              {done ? (
                <Check className="size-4" aria-hidden="true" />
              ) : current ? (
                <span className={cn('size-2 rounded-full bg-white', critical && 'animate-pulse')} aria-hidden="true" />
              ) : (
                <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              )}
            </span>

            <div className={cn('pt-1', !done && !current && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-x-2">
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                {current && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      critical ? 'bg-danger-50 text-danger-700' : 'bg-brand-50 text-brand-700',
                    )}
                  >
                    Current
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{entry?.note || step.description}</p>
              {entry?.at && (
                <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(entry.at)}</p>
              )}
            </div>
          </li>
        )
      })}

      {terminal && (
        <li className="relative flex gap-4">
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-danger-600 text-white">
            <X className="size-4" aria-hidden="true" />
          </span>
          <div className="pt-1">
            <p className="text-sm font-semibold text-danger-700">
              {status === 'rejected' ? 'Rejected' : 'Cancelled'}
            </p>
            <p className="text-xs text-slate-500">
              {order.rejectedReason || byStatus[status]?.note || 'This order did not proceed.'}
            </p>
            {byStatus[status]?.at && (
              <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(byStatus[status].at)}</p>
            )}
          </div>
        </li>
      )}
    </ol>
  )
}

/** Compact horizontal progress used in list rows. */
export function OrderProgressBar({ status }) {
  const terminal = status === 'rejected' || status === 'cancelled'
  const currentIndex = ORDER_STATUS_MAP[status]?.index ?? -1
  const pct = terminal ? 100 : ((currentIndex + 1) / ORDER_STATUSES.length) * 100
  return (
    <div className="flex items-center gap-2">
      <Truck className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', terminal ? 'bg-danger-400' : 'bg-brand-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
