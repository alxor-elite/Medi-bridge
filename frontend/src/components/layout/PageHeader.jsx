import { cn } from '../../lib/cn'

/** Consistent page title block for dashboard pages. */
export function PageHeader({ title, description, icon: Icon, actions, className }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
