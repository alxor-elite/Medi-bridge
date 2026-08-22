import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Map,
  Bell,
  Building2,
  Boxes,
  Inbox,
  Siren,
  ShieldCheck,
  Activity,
  Network,
  ScrollText,
} from 'lucide-react'
import { ROLES } from '../../lib/constants'

export const HOSPITAL_NAV = [
  { to: '/hospital', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/hospital/search', label: 'Emergency Search', icon: Search },
  { to: '/hospital/orders', label: 'Orders', icon: ClipboardList },
  { to: '/hospital/map', label: 'Map', icon: Map },
  { to: '/hospital/notifications', label: 'Notifications', icon: Bell },
  { to: '/hospital/profile', label: 'Profile', icon: Building2 },
]

export const SUPPLIER_NAV = [
  { to: '/supplier', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/supplier/inventory', label: 'Inventory', icon: Boxes },
  { to: '/supplier/orders', label: 'Incoming Orders', icon: Inbox },
  { to: '/supplier/emergency', label: 'Emergency Requests', icon: Siren },
  { to: '/supplier/profile', label: 'Profile', icon: Building2 },
]

export const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/verification', label: 'Verification', icon: ShieldCheck },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { to: '/admin/orders', label: 'Order Monitoring', icon: Activity },
  { to: '/admin/network', label: 'Network', icon: Network },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
]

const NAV_BY_ROLE = {
  [ROLES.HOSPITAL]: HOSPITAL_NAV,
  [ROLES.SUPPLIER]: SUPPLIER_NAV,
  [ROLES.ADMIN]: ADMIN_NAV,
}

export function navForRole(role) {
  return NAV_BY_ROLE[role] || []
}

export const ROLE_HOME = {
  [ROLES.HOSPITAL]: '/hospital',
  [ROLES.SUPPLIER]: '/supplier',
  [ROLES.ADMIN]: '/admin',
}

export const ROLE_LABEL = {
  [ROLES.HOSPITAL]: 'Hospital',
  [ROLES.SUPPLIER]: 'Supplier',
  [ROLES.ADMIN]: 'Administrator',
}
