import { cn } from '../../lib/cn'
import { Card } from './Card'
import { AnimatedNumber } from './AnimatedNumber'

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  accent: 'bg-teal-50 text-teal-600',
  neutral: 'bg-slate-100 text-slate-500',
}

/** Compact metric tile for dashboards. Animates numeric values on mount. */
export function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  hint,
  tone = 'brand',
  decimals = 0,
  animate = true,
  className,
}) {
  const isNumber = typeof value === 'number'
  return (
    <Card className={cn('p-5', className)} hover>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {animate && isNumber ? (
              <AnimatedNumber value={value} decimals={decimals} />
            ) : (
              value
            )}
            {suffix}
          </p>
        </div>
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}
