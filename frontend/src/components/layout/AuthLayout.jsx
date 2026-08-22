import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Zap, MapPin } from 'lucide-react'
import { Logo } from '../common/Logo'

const POINTS = [
  { icon: ShieldCheck, text: 'Every organization is verified before it can transact' },
  { icon: Zap, text: 'Match to the nearest available stock in minutes' },
  { icon: MapPin, text: 'Live distance, ETA and stock confidence on every result' },
]

/** Split-screen shell for the login & register screens. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 p-10 text-white lg:flex lg:flex-col">
        <Link to="/" className="relative z-10 inline-flex">
          <Logo textClassName="text-white" className="[&_span]:text-white" />
        </Link>
        <div className="relative z-10 mt-auto">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            Emergency medical supplies, found in minutes.
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <p.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-sm text-brand-100">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 mt-10 text-xs text-brand-200/80">
          Logistics & procurement only — MediBridge does not provide clinical advice.
        </p>
        {/* soft decorative blob, kept cheap */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/5" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 size-56 rounded-full bg-white/5" aria-hidden="true" />
      </div>

      {/* Form panel */}
      <div className="flex min-h-dvh flex-col px-4 py-8 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between lg:hidden">
          <Link to="/"><Logo /></Link>
        </div>
        <Link
          to="/"
          className="mt-6 hidden items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 lg:inline-flex"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
        </Link>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
