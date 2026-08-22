import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { Logo } from '../../components/common/Logo'
import { buttonVariants } from '../../components/ui/Button'
import { cn } from '../../lib/cn'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <Link to="/" className="mb-8"><Logo size={40} /></Link>
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Compass className="size-8" aria-hidden="true" />
      </span>
      <p className="mt-6 text-5xl font-bold tracking-tight text-slate-900">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-slate-500">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link to="/" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
        <Home className="size-5" /> Back to home
      </Link>
    </div>
  )
}
