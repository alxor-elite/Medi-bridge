import { cn } from '../../lib/cn'

const POSITIONS = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

/** Lightweight CSS tooltip — shows on hover and keyboard focus. */
export function Tooltip({ content, side = 'top', children, className }) {
  if (!content) return children
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-40 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-md',
          'opacity-0 scale-95 transition duration-150',
          'group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100',
          POSITIONS[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  )
}
