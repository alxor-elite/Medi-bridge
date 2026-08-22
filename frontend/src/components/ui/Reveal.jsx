import { cn } from '../../lib/cn'

/**
 * Mount reveal — a subtle upward fade. CSS-only and one-shot, so it stays
 * cheap. Pass `delay` (ms) to stagger a list.
 */
export function Reveal({ as: Comp = 'div', delay = 0, className, children, ...rest }) {
  return (
    <Comp
      className={cn('animate-slide-up', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Comp>
  )
}
