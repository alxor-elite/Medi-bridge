import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

/** Shared vertical nav used by both the desktop sidebar and mobile drawer. */
export function NavList({ nav, onNavigate }) {
  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('size-5 shrink-0', isActive ? 'text-brand-600' : 'text-slate-400')}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
