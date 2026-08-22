import { Siren, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

const TONES = {
  critical: {
    wrap: 'border-danger-200 bg-danger-50',
    icon: 'bg-danger-100 text-danger-600',
    title: 'text-danger-800',
    body: 'text-danger-700',
    defaultIcon: Siren,
  },
  urgent: {
    wrap: 'border-warning-200 bg-warning-50',
    icon: 'bg-warning-100 text-warning-700',
    title: 'text-warning-900',
    body: 'text-warning-800',
    defaultIcon: AlertTriangle,
  },
  info: {
    wrap: 'border-brand-200 bg-brand-50',
    icon: 'bg-brand-100 text-brand-600',
    title: 'text-brand-800',
    body: 'text-brand-700',
    defaultIcon: Info,
  },
}

/**
 * Contextual banner for time-critical situations. Restrained by design — a
 * tinted strip, not a full-red UI — so criticality reads clearly without
 * overwhelming the screen.
 */
export function EmergencyBanner({ tone = 'critical', title, children, icon, action, className }) {
  const t = TONES[tone] || TONES.info
  const Icon = icon || t.defaultIcon
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', t.wrap, className)}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', t.icon)}>
        <Icon className={cn('size-5', tone === 'critical' && 'animate-pulse')} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className={cn('text-sm font-semibold', t.title)}>{title}</p>}
        {children && <div className={cn('mt-0.5 text-sm', t.body)}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
