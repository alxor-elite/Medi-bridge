import { PRIORITIES } from '../../lib/constants'
import { cn } from '../../lib/cn'

const ACTIVE_TEXT = {
  critical: 'text-danger-700',
  urgent: 'text-warning-800',
  normal: 'text-brand-700',
}

/** Segmented control for choosing an emergency order's priority. */
export function PriorityToggle({ value, onChange, className }) {
  return (
    <div
      role="radiogroup"
      aria-label="Order priority"
      className={cn('inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1', className)}
    >
      {PRIORITIES.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={p.description}
            onClick={() => onChange(p.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? cn('bg-white shadow-sm', ACTIVE_TEXT[p.id])
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <span
              className={cn('size-2 rounded-full', p.dot, active && p.id === 'critical' && 'animate-pulse')}
              aria-hidden="true"
            />
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
