/** Supplier-facing API (mocked): profile, dashboard, emergency request inbox. */
import { mockResolve, minsAgoToIso } from './client'
import { EMERGENCY_REQUESTS } from '../data/emergencyRequests'
import { notificationsForRole } from '../data/notifications'
import { ORG_MAP } from '../data/organizations'
import { inventoryApi } from './inventory'
import { ordersApi } from './orders'

const requestStore = EMERGENCY_REQUESTS.map((r) => ({ ...r }))

function resolveRequest(r) {
  const from = ORG_MAP[r.fromHospitalId]
  return {
    ...r,
    at: minsAgoToIso(r.minsAgo),
    from: from ? { id: from.id, name: from.name, area: from.area } : null,
  }
}

export const suppliersApi = {
  getProfile(supplierId) {
    return mockResolve(() => {
      const o = ORG_MAP[supplierId]
      return o ? { ...o } : null
    }, 300)
  },

  listEmergencyRequests(supplierId) {
    return mockResolve(() =>
      requestStore
        .filter((r) => r.supplierId === supplierId)
        .sort((a, b) => a.minsAgo - b.minsAgo)
        .map(resolveRequest),
    )
  },

  respondToRequest(requestId, decision) {
    return mockResolve(() => {
      const r = requestStore.find((x) => x.id === requestId)
      if (!r) throw new Error('Request not found')
      r.status = decision // 'accepted' | 'declined'
      return resolveRequest(r)
    }, 400)
  },

  getNotifications() {
    return mockResolve(() =>
      notificationsForRole('supplier')
        .map((n) => ({ ...n, at: minsAgoToIso(n.minsAgo) }))
        .sort((a, b) => a.minsAgo - b.minsAgo),
    )
  },

  /** Operational dashboard summary. */
  async getDashboard(supplierId) {
    const [metrics, orders, requests] = await Promise.all([
      inventoryApi.metrics(),
      ordersApi.listForSupplier(supplierId),
      this.listEmergencyRequests(supplierId),
    ])
    const activeOrders = orders.filter(
      (o) => !['delivered', 'rejected', 'cancelled'].includes(o.status),
    )
    return mockResolve(
      () => ({
        stats: {
          inventoryItems: metrics.totalItems,
          lowStock: metrics.lowStock,
          expiringSoon: metrics.expiringSoon,
          activeOrders: activeOrders.length,
          emergencyRequests: requests.filter((r) => r.status === 'new').length,
        },
        incomingOrders: orders.filter((o) =>
          ['requested', 'accepted', 'preparing'].includes(o.status),
        ),
        emergencyRequests: requests,
      }),
      200,
    )
  },
}
