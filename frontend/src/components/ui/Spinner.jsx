import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-8' }

export function Spinner({ size = 'md', className, label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn('animate-spin text-brand-600', SIZES[size], className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
