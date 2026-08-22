import { Link } from 'react-router-dom'
import { Logo } from '../common/Logo'
import { NavList } from './NavList'
import { ROLE_LABEL } from './navConfig'
import { useAuth } from '../../context/auth'

/** Fixed desktop sidebar (hidden below lg — mobile uses the drawer). */
export function Sidebar({ nav }) {
  const { user } = useAuth()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-slate-100 px-5">
        <Link to={nav[0]?.to || '/'} aria-label="Home">
          <Logo />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavList nav={nav} />
      </div>
      <div className="border-t border-slate-100 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {ROLE_LABEL[user?.role]}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {user?.org?.name || user?.name}
        </p>
      </div>
    </aside>
  )
}
