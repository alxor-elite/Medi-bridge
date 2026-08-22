import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Store,
  Truck,
  Clock,
  Phone,
  RefreshCw,
  XCircle,
  PackageSearch,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { OrderStatusBadge, PriorityBadge } from '../../components/common/Badges'
import { OrderTimeline } from '../../components/hospital/OrderTimeline'
import { useAsync } from '../../hooks/useAsync'
import { ordersApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatCurrency, formatEta, formatNumber, timeAgo } from '../../lib/format'

const CANCELLABLE = ['requested', 'accepted']

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { data: order, loading, error, run, setData } = useAsync(() => ordersApi.get(orderId), [orderId])

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function cancelOrder() {
    setCancelling(true)
    try {
      const updated = await ordersApi.setStatus(orderId, 'cancelled', 'Cancelled by hospital')
      setData(updated)
      setConfirmCancel(false)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (error) return <Card><ErrorState onRetry={run} /></Card>

  if (!order) {
    return (
      <Card>
        <EmptyState
          icon={PackageSearch}
          title="Order not found"
          description="This order may have been removed or the link is incorrect."
          action={<Link to="/hospital/orders"><Button>View my orders</Button></Link>}
        />
      </Card>
    )
  }

  const canCancel = CANCELLABLE.includes(order.status)

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-900">{order.code}</h1>
            <PriorityBadge priority={order.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Placed {timeAgo(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} size="md" />
          <Button variant="ghost" size="icon" onClick={run} aria-label="Refresh status">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Delivery status</CardTitle></CardHeader>
          <CardBody>
            {order.etaMinutes ? (
              <p className="mb-5 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                Estimated arrival in {formatEta(order.etaMinutes)}
                {order.courier ? ` · ${order.courier}` : ''}
              </p>
            ) : null}
            <OrderTimeline order={order} />
          </CardBody>
        </Card>

        {/* Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Supplier</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Store className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{order.supplier?.name || '—'}</p>
                  <p className="text-sm text-slate-500">
                    {ORG_TYPES[order.supplier?.type] || ''}{order.supplier?.area ? ` · ${order.supplier.area}` : ''}
                  </p>
                </div>
              </div>
              {order.courier && (
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <Truck className="size-4 text-slate-400" aria-hidden="true" />{order.courier}
                </p>
              )}
              {order.supplier?.phone && (
                <a
                  href={`tel:${order.supplier.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <Phone className="size-4" aria-hidden="true" />{order.supplier.phone}
                </a>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Items</CardTitle></CardHeader>
            <CardBody>
              <ul className="divide-y divide-slate-100">
                {order.items.map((it) => (
                  <li key={it.medicineId} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{it.name}</span>
                      <span className="text-xs text-slate-500">{formatNumber(it.qty)} × {formatCurrency(it.unitPrice)}</span>
                    </span>
                    <span className="font-semibold text-slate-900">{formatCurrency(it.qty * it.unitPrice)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-slate-900">{formatCurrency(order.total)}</span>
              </div>
            </CardBody>
          </Card>

          {canCancel && (
            <Card>
              <CardBody>
                {confirmCancel ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">Cancel this order? The supplier will be notified.</p>
                    <div className="flex gap-2">
                      <Button variant="danger" fullWidth loading={cancelling} onClick={cancelOrder}>
                        Yes, cancel
                      </Button>
                      <Button variant="secondary" fullWidth disabled={cancelling} onClick={() => setConfirmCancel(false)}>
                        Keep order
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outlineDanger" fullWidth leftIcon={XCircle} onClick={() => setConfirmCancel(true)}>
                    Cancel order
                  </Button>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
