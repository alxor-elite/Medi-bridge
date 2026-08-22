/**
 * Real authentication against the MediBridge backend.
 *
 *   POST /api/auth/login     -> { token, profile, organization }
 *   POST /api/auth/register  -> { token, profile, organization }
 *   GET  /api/auth/me        -> { profile, organization }
 *
 * The backend is the only authority on identity: it verifies the bcrypt hash,
 * signs the JWT and reports the role. Nothing here fabricates a user.
 */
import { httpClient, apiErrorMessage } from './client'
import { getToken, getCachedUser, saveSession, saveUser, clearSession } from './session'

/** Backend role/type enums are upper case; the UI works in lower case. */
const toLower = (value) => String(value || '').toLowerCase()

const ROLE_TITLES = {
  hospital: 'Emergency Procurement Lead',
  supplier: 'Dispatch Manager',
  admin: 'Network Administrator',
  delivery: 'Delivery Partner',
}

export const ROLE_LABELS = {
  hospital: 'Hospital',
  supplier: 'Supplier',
  admin: 'Admin',
  delivery: 'Delivery partner',
}

/** Map the backend organisation projection onto the shape the UI renders. */
function toOrganization(organization) {
  if (!organization) return null
  return {
    id: organization.id,
    name: organization.name,
    type: toLower(organization.type),
    verification: toLower(organization.verificationStatus),
    verificationStatus: organization.verificationStatus,
    phone: organization.phone || null,
    email: organization.email || null,
    address: organization.address || null,
    license: organization.licenseNumber || organization.registrationNumber || null,
    registrationNumber: organization.registrationNumber || null,
    reliability: organization.reliabilityScore ?? null,
    joinedAt: organization.createdAt || null,
    lat: organization.latitude ?? null,
    lng: organization.longitude ?? null,
  }
}

/** Map { profile, organization } onto the authenticated user the UI consumes. */
function toUser(data) {
  const profile = data?.profile
  if (!profile) return null

  const role = toLower(profile.role)
  const organization = toOrganization(data.organization)

  return {
    id: profile.id,
    name: profile.full_name,
    title: ROLE_TITLES[role] || 'Team member',
    role,
    email: profile.email,
    phone: profile.phone || null,
    orgId: profile.organization_id || organization?.id || null,
    org: organization,
  }
}

/** Re-throw a display-ready message, keeping the axios error as the cause so
 *  callers can still read field-level validation details. */
function fail(error, fallback) {
  throw new Error(apiErrorMessage(error, fallback), { cause: error })
}

export const authApi = {
  /**
   * Signs in with real credentials. `role` is only the role the visitor picked
   * on the form — it never authenticates anyone, it is checked against the
   * role the backend reports and a mismatch is refused.
   */
  async login({ email, password, role }) {
    let data
    try {
      const response = await httpClient.post('/auth/login', { email, password })
      data = response.data?.data
    } catch (error) {
      // 401 from the backend means bad credentials, whatever the reason.
      if (error?.response?.status === 401) {
        throw new Error('Invalid email or password.', { cause: error })
      }
      fail(error, 'Unable to sign in right now.')
    }

    const user = toUser(data)
    if (!user || !data?.token) {
      throw new Error('The server returned an unexpected login response.')
    }

    if (role && user.role !== role) {
      const actual = ROLE_LABELS[user.role] || user.role
      const selected = ROLE_LABELS[role] || role
      // Do not keep a session the visitor was refused.
      clearSession()
      throw new Error(
        `This is a ${actual} account, not a ${selected} account. Select ${actual} and try again.`,
      )
    }

    saveSession(data.token, user)
    return user
  },

  /** Creates the profile (and its organisation) through the backend. */
  async register(payload) {
    let data
    try {
      const response = await httpClient.post('/auth/register', payload)
      data = response.data?.data
    } catch (error) {
      fail(error, 'Registration could not be completed.')
    }

    const user = toUser(data)
    if (!user || !data?.token) {
      throw new Error('The server returned an unexpected registration response.')
    }

    saveSession(data.token, user)
    return { user, organization: user.org }
  },

  async logout() {
    clearSession()
    return true
  },

  /**
   * Restores the session on boot: the stored JWT is validated by the backend,
   * and an expired or revoked token clears the session.
   */
  async current() {
    if (!getToken()) {
      clearSession()
      return null
    }

    try {
      const response = await httpClient.get('/auth/me')
      const user = toUser(response.data?.data)
      if (!user) throw new Error('Invalid session')
      saveUser(user)
      return user
    } catch (error) {
      // Only a rejected token invalidates the session; a network blip should
      // not sign the user out mid-shift.
      const status = error?.response?.status
      if (!status || status === 401 || status === 403) {
        clearSession()
        return null
      }
      return getCachedUser()
    }
  },

  /** Last known user, for painting the shell before /auth/me answers. */
  cached() {
    return getToken() ? getCachedUser() : null
  },

  hasToken() {
    return Boolean(getToken())
  },
}
