import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Phone, Clock, RefreshCw, PackageSearch, XCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { OrderStatusBadge, PriorityBadge } from '../../components/common/Badges'
import { OrderTimeline } from '../../components/hospital/OrderTimeline'
import { nextStatusFor } from '../../components/supplier/OrderCard'
import { useAsync } from '../../hooks/useAsync'
import { ordersApi } from '../../api'
import { formatCurrency, formatEta, formatNumber, timeAgo } from '../../lib/format'

export default function OrderDetails() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { data: order, loading, error, run, setData } = useAsync(() => ordersApi.get(orderId), [orderId])
  const [busy, setBusy] = useState(false)

  async function setStatus(statusId, note) {
    setBusy(true)
    try {
      const updated = await ordersApi.setStatus(orderId, statusId, note)
      setData(updated)
    } finally {
      setBusy(false)
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
          description="This order may have been removed."
          action={<Link to="/supplier/orders"><Button>Back to orders</Button></Link>}
        />
      </Card>
    )
  }

  const next = nextStatusFor(order.status)
  const canReject = order.status === 'requested'

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
          <p className="mt-1 text-sm text-slate-500">Received {timeAgo(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} size="md" />
          <Button variant="ghost" size="icon" onClick={run} aria-label="Refresh">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Order status</CardTitle></CardHeader>
          <CardBody><OrderTimeline order={order} /></CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Hospital</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{order.hospital?.name || '—'}</p>
                  {order.hospital?.area && (
                    <p className="flex items-center gap-1 text-sm text-slate-500">
                      <MapPin className="size-3.5" aria-hidden="true" />{order.hospital.area}
                    </p>
                  )}
                </div>
              </div>
              {order.etaMinutes ? (
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="size-4 text-slate-400" aria-hidden="true" />Committed ETA {formatEta(order.etaMinutes)}
                </p>
              ) : null}
              {order.hospital?.phone && (
                <a href={`tel:${order.hospital.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                  <Phone className="size-4" aria-hidden="true" />{order.hospital.phone}
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

          {(next || canReject) && (
            <Card>
              <CardBody className="flex flex-col gap-2">
                {next && (
                  <Button variant={next.variant} fullWidth loading={busy} onClick={() => setStatus(next.id, null)}>
                    {next.label}
                  </Button>
                )}
                {canReject && (
                  <Button variant="outlineDanger" fullWidth leftIcon={XCircle} disabled={busy} onClick={() => setStatus('rejected', 'Rejected by supplier')}>
                    Reject order
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
