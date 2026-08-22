import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Slide-in side sheet (used for mobile navigation). */
export function Drawer({ open, onClose, title, children, side = 'left', className }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const sideClasses =
    side === 'right'
      ? 'right-0 rounded-l-2xl'
      : 'left-0 rounded-r-2xl'

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ animationDuration: '0.25s' }}
        className={cn(
          'absolute inset-y-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl animate-slide-up',
          sideClasses,
          className,
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="font-semibold text-slate-900">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
