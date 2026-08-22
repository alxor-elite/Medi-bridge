import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 shadow-sm',
  success: 'bg-success-600 text-white hover:bg-success-700 shadow-sm',
  outlineDanger:
    'bg-white border border-danger-300 text-danger-700 hover:bg-danger-50',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  // For placing on top of a brand-colored (blue) surface:
  inverse:
    'bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 shadow-sm',
  onBrand:
    'border border-white/60 text-white hover:bg-white/15 active:bg-white/25',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-lg',
}

/** Shared classes so <Link> can look like a button too. */
export function buttonVariants({ variant = 'primary', size = 'md' } = {}) {
  return cn(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
    'transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98]',
    'disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  fullWidth = false,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : LeftIcon ? (
        <LeftIcon className="size-4" aria-hidden="true" />
      ) : null}
      {children}
      {!loading && RightIcon ? (
        <RightIcon className="size-4" aria-hidden="true" />
      ) : null}
    </button>
  )
}
