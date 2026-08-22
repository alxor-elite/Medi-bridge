import { Link } from 'react-router-dom'
import { Store, ArrowRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { OrderStatusBadge, PriorityBadge } from '../common/Badges'
import { OrderProgressBar } from './OrderTimeline'
import { formatCurrency, formatEta, timeAgo } from '../../lib/format'

function itemsSummary(items = []) {
  if (!items.length) return '—'
  const [first] = items
  const extra = items.length - 1
  return extra > 0 ? `${first.name} +${extra} more` : first.name
}

/** Compact order row for the hospital's dashboard and orders list. */
export function HospitalOrderCard({ order }) {
  const to = `/hospital/orders/${order.id}`
  const showProgress = !['delivered', 'rejected', 'cancelled'].includes(order.status)
  return (
    <Card hover className="p-4">
      <Link to={to} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-900">{order.code}</span>
              <PriorityBadge priority={order.priority} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <Store className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{order.supplier?.name || 'Supplier'}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{itemsSummary(order.items)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {showProgress && (
          <div className="mt-3">
            <OrderProgressBar status={order.status} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {order.status === 'delivered' ? 'Delivered' : order.etaMinutes ? `ETA ${formatEta(order.etaMinutes)}` : 'Placed'} · {timeAgo(order.createdAt)}
          </span>
          <span className="flex items-center gap-1 font-medium text-brand-600">
            {formatCurrency(order.total)}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </Card>
  )
}
