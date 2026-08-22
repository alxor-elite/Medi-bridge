import { Suspense, lazy, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Clock, MapPin, ChevronRight, ShieldCheck } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAsync } from '../../hooks/useAsync'
import { hospitalsApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatDistance, formatEta } from '../../lib/format'
import { cn } from '../../lib/cn'

const MapView = lazy(() => import('../../components/hospital/MapView'))

function MapSkeleton() {
  return <Skeleton className="aspect-[4/3] w-full rounded-xl" />
}

export default function MapPage() {
  const [selectedId, setSelectedId] = useState(null)
  const { data: home, loading: homeLoading } = useAsync(() => hospitalsApi.getHome(), [])
  const { data: suppliers, loading, error, run } = useAsync(() => hospitalsApi.nearbySuppliers(8), [])

  const points = (suppliers || []).map((s, i) => ({ ...s, recommended: i === 0 }))
  const activeId = selectedId ?? points[0]?.id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Supplier map</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verified suppliers near {home?.name || 'your facility'}, by proximity.
        </p>
      </div>

      {error ? (
        <Card><ErrorState onRetry={run} /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {loading || homeLoading ? (
              <MapSkeleton />
            ) : (
              <Suspense fallback={<MapSkeleton />}>
                <MapView home={home} points={points} selectedId={activeId} onSelect={setSelectedId} />
              </Suspense>
            )}
          </div>

          <Card className="h-fit">
            <CardHeader><CardTitle>Nearby suppliers</CardTitle></CardHeader>
            <CardBody className="space-y-1.5">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)
                : points.map((s) => {
                    const active = s.id === activeId
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          'rounded-lg border p-3 transition-colors',
                          active ? 'border-brand-300 bg-brand-50/60' : 'border-transparent hover:bg-slate-50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(s.id)}
                          className="flex w-full items-start gap-3 text-left"
                          aria-pressed={active}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                            <Store className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-slate-900">{s.name}</span>
                              <ShieldCheck className="size-3.5 shrink-0 text-success-500" aria-hidden="true" />
                            </span>
                            <span className="block text-xs text-slate-500">{ORG_TYPES[s.type]} · {s.area}</span>
                            <span className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                              <span className="flex items-center gap-1"><MapPin className="size-3 text-slate-400" aria-hidden="true" />{formatDistance(s.distanceKm)}</span>
                              <span className="flex items-center gap-1"><Clock className="size-3 text-slate-400" aria-hidden="true" />{formatEta(s.etaMinutes)}</span>
                            </span>
                          </span>
                        </button>
                        {active && (
                          <Link
                            to={`/hospital/supplier/${s.id}`}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                          >
                            View details <ChevronRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    )
                  })}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
