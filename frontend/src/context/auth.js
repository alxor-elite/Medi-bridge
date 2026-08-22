import { createContext, useContext } from 'react'

/** Auth context — consumed via useAuth(). Provider lives in AuthProvider.jsx. */
export const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
