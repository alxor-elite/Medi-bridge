import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { cn } from '../../lib/cn'

/** Error placeholder with an optional retry action. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We couldn’t load this right now. Please try again.',
  onRetry,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" leftIcon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
