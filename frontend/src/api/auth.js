/** Auth API (mocked). Roles: hospital, supplier, admin. */
import { mockResolve } from './client'
import { ROLES } from '../lib/constants'
import { ORG_MAP } from '../data/organizations'

const DEMO_USERS = {
  [ROLES.HOSPITAL]: {
    id: 'user-hospital',
    name: 'Dr. Meera Rao',
    title: 'Emergency Procurement Lead',
    role: ROLES.HOSPITAL,
    orgId: 'org-city-general',
    email: 'meera.rao@citygeneral.example',
  },
  [ROLES.SUPPLIER]: {
    id: 'user-supplier',
    name: 'Anil Kumar',
    title: 'Dispatch Manager',
    role: ROLES.SUPPLIER,
    orgId: 'org-medplus',
    email: 'anil.kumar@medplus.example',
  },
  [ROLES.ADMIN]: {
    id: 'user-admin',
    name: 'Sana Iqbal',
    title: 'Network Administrator',
    role: ROLES.ADMIN,
    orgId: null,
    email: 'sana.iqbal@medibridge.example',
  },
}

function decorate(user) {
  if (!user) return null
  const org = user.orgId ? ORG_MAP[user.orgId] : null
  return { ...user, org: org ? { id: org.id, name: org.name, type: org.type } : null }
}

export const authApi = {
  /** Mock login — any password works; role selects the demo identity. */
  async login({ role = ROLES.HOSPITAL }) {
    return mockResolve(() => {
      const user = decorate(DEMO_USERS[role])
      if (!user) throw new Error('Unknown role')
      localStorage.setItem('medibridge_token', `demo-${role}-token`)
      localStorage.setItem('medibridge_user', JSON.stringify(user))
      return user
    }, 500)
  },

  async logout() {
    localStorage.removeItem('medibridge_token')
    localStorage.removeItem('medibridge_user')
    return true
  },

  /** Restore a session from localStorage (used on app boot). */
  current() {
    try {
      const raw = localStorage.getItem('medibridge_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  demoUser(role) {
    return decorate(DEMO_USERS[role])
  },
}
