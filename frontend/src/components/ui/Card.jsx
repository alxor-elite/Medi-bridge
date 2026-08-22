import { cn } from '../../lib/cn'

export function Card({ as: Comp = 'div', className, hover = false, children, ...rest }) {
  return (
    <Comp
      className={cn(
        'bg-white rounded-2xl border border-slate-200 shadow-sm',
        hover && 'transition-all duration-200 hover:shadow-md hover:border-slate-300',
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  )
}

export function CardHeader({ className, children, ...rest }) {
  return (
    <div className={cn('px-5 py-4 border-b border-slate-100', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...rest }) {
  return (
    <h3 className={cn('text-base font-semibold text-slate-900', className)} {...rest}>
      {children}
    </h3>
  )
}

export function CardBody({ className, children, ...rest }) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...rest }) {
  return (
    <div className={cn('px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl', className)} {...rest}>
      {children}
    </div>
  )
}
