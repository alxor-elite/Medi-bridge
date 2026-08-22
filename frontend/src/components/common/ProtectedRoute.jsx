import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import { ROLE_HOME } from '../layout/navConfig'

/** Gate a route by auth + role. Redirects to login or the user's own home. */
export function ProtectedRoute({ role, children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (role && user.role !== role) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }
  return children
}
