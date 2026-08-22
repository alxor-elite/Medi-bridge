import { Link } from 'react-router-dom'
import { Building2, MapPin, Clock, ArrowRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { OrderStatusBadge, PriorityBadge } from '../common/Badges'
import { formatCurrency, formatNumber, timeAgo, formatEta, pluralize } from '../../lib/format'

/** Next lifecycle step a supplier can advance an order to. */
const ADVANCE = {
  requested: { id: 'accepted', label: 'Accept order', variant: 'primary' },
  accepted: { id: 'preparing', label: 'Start preparing', variant: 'primary' },
  preparing: { id: 'dispatched', label: 'Mark dispatched', variant: 'primary' },
  dispatched: { id: 'out_for_delivery', label: 'Out for delivery', variant: 'primary' },
  out_for_delivery: { id: 'delivered', label: 'Mark delivered', variant: 'success' },
}

export function nextStatusFor(status) {
  return ADVANCE[status] || null
}

/** Incoming order for the supplier queue, with inline lifecycle actions. */
export function OrderCard({ order, onAdvance, onReject, busy, detailsTo }) {
  const next = ADVANCE[order.status]
  const canReject = order.status === 'requested'

  return (
    <Card className="p-5" hover>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{order.code}</span>
            <PriorityBadge priority={order.priority} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <Building2 className="size-4 text-slate-400" aria-hidden="true" />
            {order.hospital?.name || 'Hospital'}
            {order.hospital?.area && (
              <>
                <span aria-hidden="true">·</span>
                <MapPin className="size-3.5 text-slate-400" aria-hidden="true" />
                {order.hospital.area}
              </>
            )}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <ul className="mt-3 space-y-1 border-y border-slate-100 py-3 text-sm">
        {order.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="text-slate-700">{it.name}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              ×{formatNumber(it.qty)}
              {it.unitPrice ? ` · ${formatCurrency(it.qty * it.unitPrice)}` : ''}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Clock className="size-4" aria-hidden="true" />
          {timeAgo(order.createdAt)}
          {order.etaMinutes ? ` · ETA ${formatEta(order.etaMinutes)}` : ''}
        </span>
        <span className="font-semibold text-slate-900">{formatCurrency(order.total)}</span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {next && (
          <Button
            variant={next.variant}
            size="sm"
            loading={busy}
            onClick={() => onAdvance?.(order, next.id)}
          >
            {next.label}
          </Button>
        )}
        {canReject && (
          <Button variant="outlineDanger" size="sm" disabled={busy} onClick={() => onReject?.(order)}>
            Reject
          </Button>
        )}
        {detailsTo && (
          <Link
            to={detailsTo}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 sm:ml-auto"
          >
            Details <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </Card>
  )
}
