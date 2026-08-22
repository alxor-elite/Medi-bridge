import { useMemo, useState } from 'react'
import { SearchX, MapPinned } from 'lucide-react'
import { SupplierCard } from './SupplierCard'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Select } from '../ui/Input'
import { pluralize } from '../../lib/format'

const SORTS = {
  recommended: { label: 'Recommended', fn: null },
  distance: { label: 'Nearest first', fn: (a, b) => a.distanceKm - b.distanceKm },
  eta: { label: 'Fastest delivery', fn: (a, b) => a.etaMinutes - b.etaMinutes },
  stock: { label: 'Most stock', fn: (a, b) => b.stock - a.stock },
  confidence: { label: 'Highest confidence', fn: (a, b) => b.confidence - a.confidence },
  price: {
    label: 'Lowest price',
    fn: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  },
}

function CardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <Skeleton className="mt-4 h-1.5 w-full" />
      <Skeleton className="mt-5 h-10 w-full" />
    </Card>
  )
}

/**
 * Ranked list of verified suppliers for a searched medicine. Handles the
 * loading, empty and error states the spec calls for, plus client-side sorting.
 */
export function SupplierList({ result, loading, error, onRetry, onReserve, detailsToFor }) {
  const [sort, setSort] = useState('recommended')

  const suppliers = useMemo(() => {
    const list = result?.suppliers ? [...result.suppliers] : []
    const fn = SORTS[sort]?.fn
    if (fn) list.sort(fn)
    return list
  }, [result, sort])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <ErrorState
          title="Couldn’t load suppliers"
          description="There was a problem matching suppliers for this item. Please try again."
          onRetry={onRetry}
        />
      </Card>
    )
  }

  if (!result) return null

  if (!suppliers.length) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="No verified suppliers found"
          description="No verified supplier in the network is currently listing this item. Try a related item or widen your search."
        />
      </Card>
    )
  }

  const unit = result.medicine?.unit || 'units'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <MapPinned className="size-5 text-brand-600" aria-hidden="true" />
          {pluralize(result.count, 'verified supplier')} available
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="whitespace-nowrap">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-44">
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {suppliers.map((s) => (
          <SupplierCard
            key={s.supplierId}
            supplier={s}
            unit={unit}
            requested={result.requested}
            onReserve={onReserve}
            detailsTo={detailsToFor?.(s)}
          />
        ))}
      </div>
    </div>
  )
}
