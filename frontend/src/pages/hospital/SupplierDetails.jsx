import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Gauge,
  CalendarClock,
  FileCheck2,
  Boxes,
  Clock,
  IndianRupee,
  Building2,
  Info,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { VerificationBadge } from '../../components/common/Badges'
import { useAsync } from '../../hooks/useAsync'
import { hospitalsApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import {
  formatDistance,
  formatEta,
  formatCurrency,
  formatNumber,
  formatDate,
} from '../../lib/format'
import { cn } from '../../lib/cn'

function confidenceTone(v) {
  if (v >= 85) return { bar: 'bg-success-500', text: 'text-success-700', label: 'High' }
  if (v >= 72) return { bar: 'bg-brand-500', text: 'text-brand-700', label: 'Good' }
  return { bar: 'bg-warning-500', text: 'text-warning-800', label: 'Moderate' }
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

export default function SupplierDetails() {
  const { supplierId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const medId = params.get('med') || ''
  const qty = Number(params.get('qty')) || 20

  const { data: org, loading, error, run } = useAsync(
    () => hospitalsApi.getSupplier(supplierId),
    [supplierId],
  )
  const { data: match, loading: matchLoading } = useAsync(
    () =>
      medId
        ? hospitalsApi
            .findSuppliers(medId, qty)
            .then((r) => ({
              medicine: r.medicine,
              requested: r.requested,
              row: r.suppliers.find((s) => s.supplierId === supplierId) || null,
            }))
        : Promise.resolve(null),
    [medId, qty, supplierId],
  )

  function onReserve() {
    navigate('/hospital/create-order', {
      state: {
        supplierId,
        supplier: match?.row,
        medicine: match?.medicine,
        quantity: match?.requested ?? qty,
        priority: 'critical',
      },
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-40" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (error) {
    return <Card><ErrorState onRetry={run} /></Card>
  }

  if (!org) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          title="Supplier not found"
          description="This supplier may no longer be on the network."
          action={<Link to="/hospital/search"><Button>Back to search</Button></Link>}
        />
      </Card>
    )
  }

  const row = match?.row
  const conf = row ? confidenceTone(row.confidence) : null

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to results
      </button>

      {/* Profile header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{org.name}</h1>
              <VerificationBadge status={org.verification} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
              <span>{ORG_TYPES[org.type] || org.type}</span>
              <span aria-hidden="true">·</span>
              <MapPin className="size-4" aria-hidden="true" />
              <span>{org.address || org.area}, {org.city}</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Availability for the searched item */}
          {medId && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Availability{match?.medicine ? ` · ${match.medicine.name}` : ''}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {matchLoading ? (
                  <Skeleton className="h-40" />
                ) : row ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Stat
                        icon={Boxes}
                        label="In stock"
                        value={`${formatNumber(row.stock)} ${match?.medicine?.unit || 'units'}`}
                      />
                      <Stat icon={MapPin} label="Distance" value={formatDistance(row.distanceKm)} />
                      <Stat icon={Clock} label="Est. delivery" value={formatEta(row.etaMinutes)} />
                      <Stat
                        icon={IndianRupee}
                        label="Unit price"
                        value={row.price != null ? formatCurrency(row.price) : 'On request'}
                      />
                    </div>

                    <div className="mt-5">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-slate-600">
                          <Gauge className="size-3.5 text-slate-400" aria-hidden="true" />
                          Stock confidence
                        </span>
                        <span className={cn('font-semibold', conf.text)}>
                          {row.confidence}% · {conf.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', conf.bar)} style={{ width: `${row.confidence}%` }} />
                      </div>
                    </div>

                    <div className="mt-5">
                      <Button fullWidth onClick={onReserve} disabled={!match?.medicine}>
                        Reserve stock
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={Boxes}
                    title="Item not listed here"
                    description="This supplier isn’t currently listing the searched item. Try another verified supplier from your results."
                  />
                )}
              </CardBody>
            </Card>
          )}

          {/* About */}
          <Card>
            <CardHeader><CardTitle>About this supplier</CardTitle></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Stat
                  icon={ShieldCheck}
                  label="Reliability"
                  value={org.reliability != null ? `${org.reliability}%` : '—'}
                />
                <Stat
                  icon={Gauge}
                  label="Fulfilment rate"
                  value={org.fulfilmentRate != null ? `${org.fulfilmentRate}%` : '—'}
                />
                <Stat icon={CalendarClock} label="On network since" value={formatDate(org.joinedAt)} />
                <Stat icon={FileCheck2} label="License" value={org.license || '—'} />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Contact */}
        <Card className="h-fit">
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            {org.contactName && <Stat icon={Building2} label="Primary contact" value={org.contactName} />}
            {org.phone && (
              <a href={`tel:${org.phone.replace(/\s/g, '')}`} className="block rounded-lg transition-colors hover:bg-slate-50">
                <Stat icon={Phone} label="Phone" value={org.phone} />
              </a>
            )}
            {org.email && (
              <a href={`mailto:${org.email}`} className="block rounded-lg transition-colors hover:bg-slate-50">
                <Stat icon={Mail} label="Email" value={org.email} />
              </a>
            )}
            <p className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Contact details are for procurement coordination only.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
