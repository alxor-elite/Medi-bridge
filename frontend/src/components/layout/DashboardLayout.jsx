import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { NavList } from './NavList'
import { Drawer } from '../ui/Drawer'
import { navForRole } from './navConfig'
import { useAuth } from '../../context/auth'

/** Authenticated app shell: sidebar + topbar + routed content. */
export function DashboardLayout() {
  const { user } = useAuth()
  const nav = navForRole(user?.role)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-slate-50">
      <Sidebar nav={nav} />
      <div className="lg:pl-64">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Menu">
        <NavList nav={nav} onNavigate={() => setMobileOpen(false)} />
      </Drawer>
    </div>
  )
}
