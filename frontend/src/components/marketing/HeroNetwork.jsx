import { Hospital, Pill, Store, Truck, Syringe, ShieldCheck, MapPin } from 'lucide-react'

/**
 * Lightweight supply-network illustration: a hospital at the centre linked to
 * nearby verified suppliers. Pure HTML/SVG — the only motion is a single
 * pulse ring on the hub (cheap, and disabled under reduced-motion).
 */
const NODES = [
  { x: 15, y: 20, icon: Pill, tone: 'slate' },
  { x: 82, y: 17, icon: Store, tone: 'brand', active: true },
  { x: 12, y: 74, icon: Truck, tone: 'slate' },
  { x: 86, y: 72, icon: Syringe, tone: 'slate' },
  { x: 50, y: 10, icon: Pill, tone: 'slate' },
]

const TONE = {
  slate: 'bg-white text-slate-500 border-slate-200',
  brand: 'bg-brand-600 text-white border-brand-600',
}

export function HeroNetwork() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-lg" aria-hidden="true">
      {/* connecting lines */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 400 400"
        preserveAspectRatio="none"
      >
        {NODES.map((n, i) => (
          <line
            key={i}
            x1="200"
            y1="200"
            x2={(n.x / 100) * 400}
            y2={(n.y / 100) * 400}
            stroke={n.active ? '#3b82f6' : '#e2e8f0'}
            strokeWidth={n.active ? 2.5 : 1.5}
            strokeDasharray={n.active ? '0' : '4 4'}
          />
        ))}
      </svg>

      {/* hub: hospital */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 -z-10 animate-ping rounded-2xl bg-brand-400/40" />
        <div className="flex size-20 items-center justify-center rounded-2xl border border-brand-700 bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg">
          <Hospital className="size-9" />
        </div>
      </div>

      {/* supplier nodes */}
      {NODES.map((n, i) => {
        const Icon = n.icon
        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <div className={`flex size-12 items-center justify-center rounded-xl border shadow-sm ${TONE[n.tone]}`}>
              <Icon className="size-5" />
            </div>
          </div>
        )
      })}

      {/* floating match chip near the recommended supplier */}
      <div className="absolute right-0 top-[30%] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-md">
        <span className="flex size-6 items-center justify-center rounded-full bg-success-50 text-success-600">
          <ShieldCheck className="size-4" />
        </span>
        <span className="text-left">
          <span className="block text-xs font-semibold text-slate-900">MedPlus · 45 units</span>
          <span className="block text-[11px] text-slate-500">1.4 km · 12 min ETA</span>
        </span>
      </div>

      <div className="absolute bottom-[16%] left-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-md">
        <MapPin className="size-3.5 text-brand-600" />
        <span className="text-[11px] font-medium text-slate-700">7 verified nearby</span>
      </div>
    </div>
  )
}
