import { cn } from '../../lib/cn'

const VARIANTS = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  accent: 'bg-teal-50 text-teal-700 ring-teal-200',
}

const DOTS = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  warning: 'bg-warning-500',
  accent: 'bg-teal-500',
}

const SIZES = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
}

/**
 * Status pill. Never rely on color alone — pass an `icon` or `dot` and always
 * keep the text label for accessibility.
 */
export function Badge({
  variant = 'neutral',
  size = 'sm',
  icon: Icon,
  dot = false,
  pulse = false,
  className,
  children,
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full ring-1 ring-inset',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('size-1.5 rounded-full', DOTS[variant], pulse && 'animate-pulse')}
          aria-hidden="true"
        />
      )}
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
