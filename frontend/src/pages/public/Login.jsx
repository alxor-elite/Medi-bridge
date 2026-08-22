import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Hospital, Store, ShieldCheck, Mail, Lock, LogIn, AlertCircle } from 'lucide-react'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Field, Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/auth'
import { ROLES } from '../../lib/constants'
import { ROLE_HOME } from '../../components/layout/navConfig'
import { cn } from '../../lib/cn'

const ROLE_OPTIONS = [
  { id: ROLES.HOSPITAL, label: 'Hospital', icon: Hospital, desc: 'Search & order supplies' },
  { id: ROLES.SUPPLIER, label: 'Supplier', icon: Store, desc: 'Manage stock & orders' },
  { id: ROLES.ADMIN, label: 'Admin', icon: ShieldCheck, desc: 'Verify & monitor' },
]

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const from = location.state?.from

  const [role, setRole] = useState(ROLES.HOSPITAL)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }

    setSubmitting(true)
    try {
      // The backend verifies the credentials; the role buttons above only say
      // which dashboard the visitor expects, they never grant access.
      const user = await login({ email: email.trim(), password, role })
      navigate(from || ROLE_HOME[user.role] || '/', { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid email or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Log in to MediBridge"
      subtitle="Sign in with your MediBridge account credentials."
      footer={
        <>
          New organization?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Register here
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-slate-700">I am a…</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
            {ROLE_OPTIONS.map((r) => {
              const active = role === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <r.icon className={cn('size-5', active ? 'text-brand-600' : 'text-slate-400')} aria-hidden="true" />
                  <span className={cn('text-sm font-semibold', active ? 'text-brand-700' : 'text-slate-700')}>
                    {r.label}
                  </span>
                  <span className="text-[11px] leading-tight text-slate-400">{r.desc}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-3 text-sm font-medium text-danger-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            leftIcon={Mail}
            value={email}
            placeholder="you@organization.com"
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            leftIcon={Lock}
            value={password}
            placeholder="••••••••"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" fullWidth size="lg" loading={submitting} leftIcon={LogIn}>
          Log in as {ROLE_OPTIONS.find((r) => r.id === role)?.label}
        </Button>
      </form>
    </AuthLayout>
  )
}
