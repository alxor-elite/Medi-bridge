import { useMemo } from 'react'
import { Hospital, MapPin, Star } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatDistance, formatEta } from '../../lib/format'

/**
 * Lightweight schematic proximity map. Deliberately NOT a tiled/WebGL map —
 * it projects real lat/lng onto a padded box with plain SVG + positioned
 * markers, so it stays fast on modest laptops and phones. Lazy-loaded by
 * callers via React.lazy (hence the default export).
 */

function useProjection(home, points) {
  return useMemo(() => {
    const all = [home, ...points].filter((p) => p && p.lat != null && p.lng != null)
    const lats = all.map((p) => p.lat)
    const lngs = all.map((p) => p.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const spanLat = maxLat - minLat || 0.01
    const spanLng = maxLng - minLng || 0.01
    const pad = 12 // percent padding inside the box

    const project = (p) => ({
      x: pad + ((p.lng - minLng) / spanLng) * (100 - pad * 2),
      // invert latitude so north is up
      y: pad + ((maxLat - p.lat) / spanLat) * (100 - pad * 2),
    })
    return project
  }, [home, points])
}

export default function MapView({ home, points = [], selectedId, onSelect, className }) {
  const project = useProjection(home, points)
  const hp = home ? project(home) : { x: 50, y: 50 }

  return (
    <div
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50',
        className,
      )}
    >
      {/* subtle grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(226 232 240 / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240 / 0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* connecting lines home → suppliers */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {points.map((p) => {
          const pt = project(p)
          const active = p.id === selectedId
          return (
            <line
              key={p.id}
              x1={`${hp.x}%`}
              y1={`${hp.y}%`}
              x2={`${pt.x}%`}
              y2={`${pt.y}%`}
              stroke={active ? '#2563eb' : '#cbd5e1'}
              strokeWidth={active ? 2 : 1}
              strokeDasharray={active ? '0' : '3 4'}
            />
          )
        })}
      </svg>

      {/* supplier markers */}
      {points.map((p) => {
        const pt = project(p)
        const active = p.id === selectedId
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect?.(p.id)}
            aria-pressed={active}
            aria-label={`${p.name}${p.distanceKm != null ? `, ${formatDistance(p.distanceKm)} away` : ''}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-transform',
                active
                  ? 'border-brand-600 text-brand-600 scale-110'
                  : p.recommended
                    ? 'border-brand-400 text-brand-500'
                    : 'border-slate-300 text-slate-400 hover:border-slate-400',
              )}
            >
              {p.recommended ? (
                <Star className="size-4 fill-current" aria-hidden="true" />
              ) : (
                <MapPin className="size-4" aria-hidden="true" />
              )}
            </span>
            {active && (
              <span className="absolute left-1/2 top-full mt-1 w-max max-w-[10rem] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left shadow-md">
                <span className="block truncate text-xs font-semibold text-slate-900">{p.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {formatDistance(p.distanceKm)} · {formatEta(p.etaMinutes)}
                </span>
              </span>
            )}
          </button>
        )
      })}

      {/* home hospital */}
      {home && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${hp.x}%`, top: `${hp.y}%` }}
        >
          <span className="flex size-11 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-md">
            <Hospital className="size-5" aria-hidden="true" />
          </span>
        </div>
      )}

      {/* legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm backdrop-blur-sm">
        <span className="flex items-center gap-1">
          <Hospital className="size-3 text-brand-600" aria-hidden="true" /> You
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-3 text-brand-500" aria-hidden="true" /> Recommended
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="size-3 text-slate-400" aria-hidden="true" /> Supplier
        </span>
      </div>
    </div>
  )
}
