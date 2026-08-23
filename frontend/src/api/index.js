/** Barrel for the API layer + a couple of role-aware convenience helpers. */
export { authApi } from './auth'
export { hospitalsApi } from './hospitals'
export { suppliersApi } from './suppliers'
export { inventoryApi } from './inventory'
export { ordersApi } from './orders'
export { adminApi } from './admin'
export { aiApi } from './ai'

import { hospitalsApi } from './hospitals'
import { suppliersApi } from './suppliers'
import { adminApi } from './admin'
import { ROLES } from '../lib/constants'

export function getNotificationsForRole(role) {
  if (role === ROLES.HOSPITAL) return hospitalsApi.getNotifications()
  if (role === ROLES.SUPPLIER) return suppliersApi.getNotifications()
  if (role === ROLES.ADMIN) return adminApi.getNotifications()
  return Promise.resolve([])
}
