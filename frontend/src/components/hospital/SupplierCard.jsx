import { Link } from 'react-router-dom'
import {
  Star,
  MapPin,
  Clock,
  Boxes,
  ShieldCheck,
  RefreshCw,
  IndianRupee,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { VerifiedTag } from '../common/Badges'
import { ORG_TYPES } from '../../lib/constants'
import { formatDistance, formatEta, formatCurrency, formatNumber } from '../../lib/format'
import { cn } from '../../lib/cn'

function confidenceTone(v) {
  if (v >= 85) return { bar: 'bg-success-500', text: 'text-success-700', label: 'High' }
  if (v >= 72) return { bar: 'bg-brand-500', text: 'text-brand-700', label: 'Good' }
  return { bar: 'bg-warning-500', text: 'text-warning-800', label: 'Moderate' }
}

function Metric({ icon: Icon, label, value, valueClass }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('text-sm font-semibold text-slate-900', valueClass)}>{value}</p>
      </div>
    </div>
  )
}

/**
 * A single verified-supplier result: stock, distance, ETA, reliability,
 * freshness, price and a blended stock-confidence score. The top match is
 * flagged "Recommended". Logistics data only — no clinical guidance.
 */
export function SupplierCard({ supplier: s, unit = 'units', requested, onReserve, detailsTo }) {
  const conf = confidenceTone(s.confidence)
  const freshLabel =
    s.freshnessMins < 60 ? `${s.freshnessMins}m ago` : `${Math.round(s.freshnessMins / 60)}h ago`

  return (
    <Card
      hover
      className={cn(
        'relative overflow-hidden p-5',
        s.recommended && 'border-brand-300 ring-1 ring-brand-200',
      )}
    >
      {s.recommended && (
        <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
          <Star className="size-3.5 fill-current" aria-hidden="true" />
          Recommended
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{s.name}</h3>
            {s.verified && <VerifiedTag />}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <span>{ORG_TYPES[s.type] || s.type}</span>
            <span aria-hidden="true">·</span>
            <MapPin className="size-3.5" aria-hidden="true" />
            {s.area}
          </p>
        </div>

        {/* Fulfilment status — icon + text, never colour alone */}
        {s.canFulfil ? (
          <Badge variant="success" icon={CheckCircle2}>
            Can fulfil {requested ? formatNumber(requested) : ''}
          </Badge>
        ) : (
          <Badge variant="warning" icon={AlertTriangle}>
            Partial stock
          </Badge>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Metric
          icon={Boxes}
          label="In stock"
          value={`${formatNumber(s.stock)} ${unit}`}
          valueClass={!s.canFulfil ? 'text-warning-800' : undefined}
        />
        <Metric icon={MapPin} label="Distance" value={formatDistance(s.distanceKm)} />
        <Metric icon={Clock} label="Est. delivery" value={formatEta(s.etaMinutes)} />
        <Metric icon={ShieldCheck} label="Reliability" value={`${s.reliability ?? '—'}%`} />
        <Metric icon={RefreshCw} label="Stock updated" value={freshLabel} />
        <Metric
          icon={IndianRupee}
          label="Unit price"
          value={s.price != null ? formatCurrency(s.price) : 'On request'}
        />
      </div>

      {/* Stock confidence */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <Gauge className="size-3.5 text-slate-400" aria-hidden="true" />
            Stock confidence
          </span>
          <span className={cn('font-semibold', conf.text)}>
            {s.confidence}% · {conf.label}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="presentation">
          <div className={cn('h-full rounded-full', conf.bar)} style={{ width: `${s.confidence}%` }} />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" fullWidth onClick={() => onReserve?.(s)}>
          Reserve stock
        </Button>
        {detailsTo && (
          <Link
            to={detailsTo}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            View details
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </Card>
  )
}
