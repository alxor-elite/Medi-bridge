import { useParams, useLocation, Link } from 'react-router-dom'
import { CheckCircle2, Store, Clock, PackageCheck, ArrowRight, Timer } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button, buttonVariants } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { PriorityBadge } from '../../components/common/Badges'
import { OrderTimeline } from '../../components/hospital/OrderTimeline'
import { useAsync } from '../../hooks/useAsync'
import { ordersApi } from '../../api'
import { formatCurrency, formatEta, formatNumber, timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

export default function ReservationConfirmation() {
  const { orderId } = useParams()
  const { state } = useLocation()

  const { data: order, loading, error, run } = useAsync(
    () => (state?.order ? Promise.resolve(state.order) : ordersApi.get(orderId)),
    [orderId],
  )
  const reservation = state?.reservation

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) return <Card><ErrorState onRetry={run} /></Card>

  if (!order) {
    return (
      <Card>
        <EmptyState
          icon={PackageCheck}
          title="Order not found"
          description="We couldn’t find this order. It may have been removed."
          action={<Link to="/hospital/orders"><Button>View my orders</Button></Link>}
        />
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Success */}
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-success-50 to-white px-6 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-100 text-success-600">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order placed</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your emergency request has been sent to the supplier.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{order.code}</span>
            <PriorityBadge priority={order.priority} />
          </div>
        </div>

        <CardBody className="border-t border-slate-100">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <Store className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <p className="text-xs text-slate-500">Supplier</p>
                <p className="text-sm font-semibold text-slate-900">{order.supplier?.name || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <p className="text-xs text-slate-500">Estimated delivery</p>
                <p className="text-sm font-semibold text-slate-900">{formatEta(order.etaMinutes)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <p className="text-xs text-slate-500">Estimated total</p>
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(order.total)}</p>
              </div>
            </div>
          </div>

          {reservation && (
            <p className="mt-5 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
              <Timer className="size-4 shrink-0" aria-hidden="true" />
              Stock reserved ({reservation.reservationId}) — held until {timeAgo(reservation.heldUntil)}.
            </p>
          )}

          <ul className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-100">
            {order.items.map((it) => (
              <li key={it.medicineId} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{it.name}</span>
                  <span className="text-xs text-slate-500">{formatNumber(it.qty)} × {formatCurrency(it.unitPrice)}</span>
                </span>
                <span className="font-semibold text-slate-900">{formatCurrency(it.qty * it.unitPrice)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* What happens next */}
      <Card>
        <CardHeader><CardTitle>What happens next</CardTitle></CardHeader>
        <CardBody>
          <OrderTimeline order={order} />
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to={`/hospital/orders/${order.id}`} className={cn(buttonVariants({ size: 'lg' }), 'flex-1')}>
          Track this order
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
        <Link to="/hospital" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'flex-1')}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
