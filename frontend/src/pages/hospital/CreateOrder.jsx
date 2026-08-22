import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Store,
  MapPin,
  Clock,
  Pill,
  PackageSearch,
  ShieldCheck,
  Info,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { PriorityToggle } from '../../components/hospital/PriorityToggle'
import { useAuth } from '../../context/auth'
import { hospitalsApi, ordersApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatCurrency, formatDistance, formatEta, formatNumber } from '../../lib/format'

export default function CreateOrder() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const supplier = state?.supplier
  const medicine = state?.medicine
  const supplierId = state?.supplierId || supplier?.supplierId

  const [quantity, setQuantity] = useState(state?.quantity || 20)
  const [priority, setPriority] = useState(state?.priority || 'critical')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!medicine || !supplier) {
    return (
      <Card>
        <EmptyState
          icon={PackageSearch}
          title="Start from a search"
          description="Choose a medicine and a verified supplier first, then reserve stock to place an order."
          action={<Link to="/hospital/search"><Button>Go to search</Button></Link>}
        />
      </Card>
    )
  }

  const unitPrice = supplier.price ?? null
  const qtyNum = Number(quantity) || 0
  const total = unitPrice != null ? qtyNum * unitPrice : null
  const overStock = supplier.stock != null && qtyNum > supplier.stock

  async function placeOrder() {
    setSubmitting(true)
    setError(null)
    try {
      const reservation = await hospitalsApi.reserve({
        supplierId,
        medicineId: medicine.id,
        quantity: qtyNum,
      })
      const order = await ordersApi.create({
        hospitalId: user?.org?.id || 'org-city-general',
        supplierId,
        priority,
        etaMinutes: supplier.etaMinutes ?? null,
        note: note.trim() || undefined,
        items: [
          {
            medicineId: medicine.id,
            name: medicine.name,
            qty: qtyNum,
            unitPrice: unitPrice ?? 0,
          },
        ],
      })
      navigate(`/hospital/confirmation/${order.id}`, { state: { order, reservation } })
    } catch {
      setError('We couldn’t place this order. Please try again.')
      setSubmitting(false)
    }
  }

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

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Place emergency order</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review the details and reserve stock. The supplier is notified immediately.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Item */}
          <Card>
            <CardHeader><CardTitle>Item</CardTitle></CardHeader>
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Pill className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{medicine.name}</p>
                  <p className="text-sm text-slate-500">
                    {medicine.generic}{medicine.form ? ` · ${medicine.form}` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Quantity (${medicine.unit || 'units'})`}
                  htmlFor="qty"
                  error={overStock ? `Only ${formatNumber(supplier.stock)} in stock at this supplier` : undefined}
                  hint={!overStock ? `${formatNumber(supplier.stock)} available` : undefined}
                >
                  <Input
                    id="qty"
                    type="number"
                    min={1}
                    value={quantity}
                    invalid={overStock}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </Field>
                <Field label="Unit price">
                  <div className="flex h-10 items-center rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-700">
                    {unitPrice != null ? formatCurrency(unitPrice) : 'On request'}
                  </div>
                </Field>
              </div>

              <div className="mt-4">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Priority</span>
                <PriorityToggle value={priority} onChange={setPriority} />
              </div>

              <Field label="Note for supplier (optional)" htmlFor="note" className="mt-4">
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Deliver to Emergency Wing, Gate 2. Contact on arrival."
                />
              </Field>
            </CardBody>
          </Card>

          {/* Supplier */}
          <Card>
            <CardHeader><CardTitle>Supplier</CardTitle></CardHeader>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Store className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                      {supplier.name}
                      <ShieldCheck className="size-4 text-success-500" aria-hidden="true" />
                    </p>
                    <p className="text-sm text-slate-500">{ORG_TYPES[supplier.type] || supplier.type}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                <span className="flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" aria-hidden="true" />{supplier.area} · {formatDistance(supplier.distanceKm)}</span>
                <span className="flex items-center gap-1.5"><Clock className="size-4 text-slate-400" aria-hidden="true" />Est. delivery {formatEta(supplier.etaMinutes)}</span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Summary */}
        <Card className="h-fit">
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Item</span>
              <span className="max-w-[60%] truncate text-right font-medium text-slate-900">{medicine.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Quantity</span>
              <span className="font-medium text-slate-900">{formatNumber(qtyNum)} {medicine.unit || 'units'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Unit price</span>
              <span className="font-medium text-slate-900">{unitPrice != null ? formatCurrency(unitPrice) : 'On request'}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <span className="font-semibold text-slate-900">Estimated total</span>
              <span className="font-bold text-slate-900">{total != null ? formatCurrency(total) : 'On request'}</span>
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <Button
              fullWidth
              size="lg"
              className="mt-1"
              loading={submitting}
              disabled={overStock || qtyNum < 1}
              onClick={placeOrder}
            >
              {submitting ? 'Placing order…' : 'Reserve & place order'}
            </Button>

            <p className="flex items-start gap-2 text-xs text-slate-400">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Placing an order reserves stock and notifies the supplier. MediBridge coordinates
              procurement only and does not provide clinical guidance.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
