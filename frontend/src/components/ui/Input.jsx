import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

const BASE =
  'w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 ' +
  'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed'

const INVALID = 'border-danger-400 focus:ring-danger-500/40 focus:border-danger-500'

/** Label + hint/error wrapper for any control. */
export function Field({ label, htmlFor, required, hint, error, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-danger-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger-600">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ leftIcon: Icon, className, invalid, ...rest }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      )}
      <input
        className={cn(BASE, 'h-10 px-3 text-sm', Icon && 'pl-9', invalid && INVALID, className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
}

export function Textarea({ className, invalid, rows = 3, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={cn(BASE, 'px-3 py-2 text-sm resize-y', invalid && INVALID, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function Select({ className, invalid, children, ...rest }) {
  return (
    <div className="relative">
      <select
        className={cn(
          BASE,
          'h-10 appearance-none pl-3 pr-9 text-sm',
          invalid && INVALID,
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </div>
  )
}
