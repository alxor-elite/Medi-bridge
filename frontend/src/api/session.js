/**
 * Session storage for the real backend session: the JWT issued by
 * POST /api/auth/login (or /register) plus the profile it belongs to.
 *
 * Kept in its own module so `client.js` can attach the bearer token without
 * importing `auth.js` (which imports the client).
 */

const TOKEN_KEY = 'medibridge_token'
const USER_KEY = 'medibridge_user'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveSession(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* storage unavailable (private mode) — the session stays in memory only */
  }
}

export function saveUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

/** Last known user, used to paint the shell before /auth/me answers. */
export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
