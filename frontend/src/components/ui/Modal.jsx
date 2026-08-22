import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

/**
 * Accessible dialog rendered in a portal. Closes on Esc / overlay click,
 * locks body scroll, and moves focus to the panel. On mobile it becomes a
 * bottom sheet.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-h-[92dvh] flex flex-col bg-white shadow-2xl outline-none',
          'rounded-t-2xl sm:rounded-2xl animate-slide-up sm:animate-scale-in',
          SIZES[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
