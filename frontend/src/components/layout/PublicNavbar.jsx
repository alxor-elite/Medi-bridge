import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from '../common/Logo'
import { Button, buttonVariants } from '../ui/Button'
import { cn } from '../../lib/cn'

const LINKS = [
  { to: '/about', label: 'How it works' },
  { to: '/verification-info', label: 'Verification' },
]

/** Marketing / public top navigation. */
export function PublicNavbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center" aria-label="MediBridge home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link to="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
            Log in
          </Link>
          <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Register
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {l.label}
              </Link>
            ))}
            <Link to="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Log in
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
