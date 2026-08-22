import { Link } from 'react-router-dom'
import { Logo } from '../common/Logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/about', label: 'How it works' },
      { to: '/verification-info', label: 'Verification' },
      { to: '/register', label: 'Register organization' },
    ],
  },
  {
    title: 'For roles',
    links: [
      { to: '/login', label: 'Hospitals' },
      { to: '/login', label: 'Suppliers & pharmacies' },
      { to: '/login', label: 'Administrators' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-500">
            MediBridge connects verified hospitals and medical suppliers in real
            time to locate critical medicines and equipment from the nearest
            available source.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold text-slate-900">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.links.map((l, i) => (
                <li key={i}>
                  <Link to={l.to} className="text-sm text-slate-500 transition-colors hover:text-brand-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} MediBridge · Emergency medical supply network</p>
          <p>A demonstration project · Logistics & procurement only, not clinical advice.</p>
        </div>
      </div>
    </footer>
  )
}
