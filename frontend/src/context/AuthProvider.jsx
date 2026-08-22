import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api/auth'
import { AuthContext } from './auth'

/**
 * Owns the authenticated session.
 *
 * On boot the stored JWT is re-validated against GET /api/auth/me, so a
 * refresh keeps a valid session and silently drops an expired one.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authApi.cached())
  // Nothing to restore without a token — skip straight to "not signed in".
  const [loading, setLoading] = useState(() => authApi.hasToken())

  useEffect(() => {
    // No stored token: the initial state above is already "signed out".
    if (!authApi.hasToken()) return undefined

    let mounted = true

    authApi
      .current()
      .then((currentUser) => {
        if (mounted) setUser(currentUser)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  /** Real sign-in. Throws with a display-ready message when it fails. */
  const login = useCallback(async ({ email, password, role }) => {
    const loggedInUser = await authApi.login({ email, password, role })
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  /** Real registration — the backend creates the profile and organisation. */
  const register = useCallback(async (payload) => {
    const result = await authApi.register(payload)
    setUser(result.user)
    return result
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
