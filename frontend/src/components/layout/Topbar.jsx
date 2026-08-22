import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Menu,
  Bell,
  ChevronDown,
  LogOut,
  Repeat2,
  Truck,
  ClipboardList,
  Boxes,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { Logo } from '../common/Logo'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { getNotificationsForRole } from '../../api'
import { ROLES } from '../../lib/constants'
import { ROLE_HOME, ROLE_LABEL } from './navConfig'
import { initials, timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'

const NTF_ICONS = {
  delivery: Truck,
  order: ClipboardList,
  stock: Boxes,
  verification: ShieldCheck,
  system: Info,
}

export function Topbar({ onOpenMenu }) {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(null) // 'ntf' | 'user' | null

  const { data } = useAsync(() => getNotificationsForRole(user?.role), [user?.role])
  const notifications = data || []
  const unread = notifications.filter((n) => !n.read).length

  const otherRoles = Object.values(ROLES).filter((r) => r !== user?.role)

  async function switchRole(role) {
    setMenu(null)
    await login(role)
    navigate(ROLE_HOME[role])
  }

  async function handleLogout() {
    setMenu(null)
    await logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link to={ROLE_HOME[user?.role] || '/'} className="lg:hidden" aria-label="Home">
        <Logo showText={false} />
      </Link>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => (m === 'ntf' ? null : 'ntf'))}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            aria-haspopup="true"
            aria-expanded={menu === 'ntf'}
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-danger-500" />
              </span>
            )}
          </button>

          {menu === 'ntf' && (
            <DropdownPanel onClose={() => setMenu(null)} className="w-80">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                {unread > 0 && (
                  <span className="text-xs font-medium text-brand-600">{unread} new</span>
                )}
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {notifications.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">You’re all caught up.</li>
                )}
                {notifications.map((n) => {
                  const Icon = NTF_ICONS[n.type] || Info
                  return (
                    <li key={n.id}>
                      <Link
                        to={n.href || '#'}
                        onClick={() => setMenu(null)}
                        className={cn(
                          'flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50',
                          !n.read && 'bg-brand-50/40',
                        )}
                      >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                          <span className="block truncate text-xs text-slate-500">{n.body}</span>
                          <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.at)}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {user?.role === ROLES.HOSPITAL && (
                <Link
                  to="/hospital/notifications"
                  onClick={() => setMenu(null)}
                  className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-medium text-brand-600 hover:bg-slate-50"
                >
                  View all
                </Link>
              )}
            </DropdownPanel>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => (m === 'user' ? null : 'user'))}
            aria-haspopup="true"
            aria-expanded={menu === 'user'}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-slate-100"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {initials(user?.name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-tight text-slate-900">{user?.name}</span>
              <span className="block text-xs leading-tight text-slate-500">{ROLE_LABEL[user?.role]}</span>
            </span>
            <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
          </button>

          {menu === 'user' && (
            <DropdownPanel onClose={() => setMenu(null)} className="w-60">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <div className="py-1">
                <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Switch demo role
                </p>
                {otherRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => switchRole(role)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Repeat2 className="size-4 text-slate-400" />
                    {ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-100 py-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </div>
            </DropdownPanel>
          )}
        </div>
      </div>
    </header>
  )
}

/** Popover surface + a click-away backdrop. */
function DropdownPanel({ children, onClose, className }) {
  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
      />
      <div
        role="menu"
        className={cn(
          'absolute right-0 z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-scale-in origin-top-right',
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
