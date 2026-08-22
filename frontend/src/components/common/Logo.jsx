import { cn } from '../../lib/cn'

/** MediBridge mark — a flat rounded tile with a medical cross. */
export function Logo({ size = 32, showText = true, className, textClassName }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label="MediBridge"
      >
        <rect width="32" height="32" rx="8" fill="#2563eb" />
        <rect x="14" y="7" width="4" height="18" rx="2" fill="white" />
        <rect x="7" y="14" width="18" height="4" rx="2" fill="white" />
      </svg>
      {showText && (
        <span className={cn('text-lg font-bold tracking-tight text-slate-900', textClassName)}>
          Medi<span className="text-brand-600">Bridge</span>
        </span>
      )}
    </span>
  )
}
