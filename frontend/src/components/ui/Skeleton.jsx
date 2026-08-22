import { cn } from '../../lib/cn'

/** Single shimmer block. Compose these for richer loading placeholders. */
export function Skeleton({ className }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />
}

/** A few lines of shimmering text. */
export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn('skeleton h-3 rounded', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
