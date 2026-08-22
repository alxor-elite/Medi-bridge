import { useCallback, useMemo, useState } from 'react'
import { authApi } from '../api/auth'
import { AuthContext } from './auth'

/** Holds the mock session and exposes login/logout to the app. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authApi.current())
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (role) => {
    setLoading(true)
    try {
      const u = await authApi.login({ role })
      setUser(u)
      return u
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, isAuthenticated: Boolean(user) }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
