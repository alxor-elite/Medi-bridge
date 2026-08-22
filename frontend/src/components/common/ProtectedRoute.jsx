import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import { Spinner } from '../ui/Spinner'
import { ROLE_HOME } from '../layout/navConfig'

/** Gate a route by auth + role. Redirects to login or the user's own home. */
export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // The stored token is still being validated against /auth/me — hold the
  // route instead of bouncing a signed-in user to the login page on refresh.
  if (loading && !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Spinner size="lg" label="Restoring your session" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (role && user.role !== role) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }
  return children
}
