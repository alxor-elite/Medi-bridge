/** Hospital-facing API (mocked): search, supplier matching, reserve, dashboard. */
import { mockResolve, minsAgoToIso } from './client'
import { searchMedicines as catalogSearch, MEDICINE_MAP } from '../data/medicines'
import { getSuppliersForMedicine } from '../data/suppliers'
import { notificationsForRole } from '../data/notifications'
import { ordersApi } from './orders'
import { ORGANIZATIONS, ORG_MAP, HOME_HOSPITAL_ID } from '../data/organizations'
import { distanceKm } from '../lib/geo'

const SUPPLIER_TYPES = ['pharmacy', 'medical_store', 'supplier']

export const hospitalsApi = {
  /** Autocomplete / catalog search over medicines & equipment. */
  searchCatalog(query) {
    return mockResolve(() => catalogSearch(query).slice(0, 8), 250)
  },

  /** Verified suppliers that can fulfil a medicine, ranked with a recommendation. */
  findSuppliers(medicineId, quantity = 20) {
    return mockResolve(() => getSuppliersForMedicine(medicineId, quantity), 600)
  },

  getMedicine(medicineId) {
    return mockResolve(() => MEDICINE_MAP[medicineId] ?? null, 200)
  },

  getSupplier(supplierId) {
    return mockResolve(() => {
      const o = ORG_MAP[supplierId]
      return o ? { ...o } : null
    }, 300)
  },

  /** The logged-in hospital's own organization (map centre / profile). */
  getHome() {
    return mockResolve(() => {
      const o = ORG_MAP[HOME_HOSPITAL_ID]
      return o ? { ...o } : null
    }, 200)
  },

  /** Verified suppliers ranked by proximity — for the dashboard & map. */
  nearbySuppliers(limit = 5) {
    return mockResolve(() => {
      const home = ORG_MAP[HOME_HOSPITAL_ID]
      return ORGANIZATIONS.filter(
        (o) => SUPPLIER_TYPES.includes(o.type) && o.verification === 'verified',
      )
        .map((o) => {
          const dist = distanceKm(home, o)
          return {
            id: o.id,
            name: o.name,
            type: o.type,
            area: o.area,
            reliability: o.reliability,
            lat: o.lat,
            lng: o.lng,
            distanceKm: Math.round(dist * 10) / 10,
            etaMinutes: Math.max(6, Math.round(dist * 3.2) + 4),
          }
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit)
    }, 350)
  },

  /** Reserve stock at a supplier — holds units before the order is confirmed. */
  reserve({ supplierId, medicineId, quantity }) {
    return mockResolve(
      () => ({
        reservationId: `RSV-${supplierId.slice(-4).toUpperCase()}-${quantity}`,
        supplierId,
        medicineId,
        quantity,
        heldUntil: minsAgoToIso(-10), // held for ~10 minutes
        status: 'held',
      }),
      550,
    )
  },

  getNotifications() {
    return mockResolve(() =>
      notificationsForRole('hospital')
        .map((n) => ({ ...n, at: minsAgoToIso(n.minsAgo) }))
        .sort((a, b) => a.minsAgo - b.minsAgo),
    )
  },

  /** Dashboard summary for the hospital home screen. */
  async getDashboard(hospitalId) {
    const orders = await ordersApi.listForHospital(hospitalId)
    return mockResolve(() => {
      const active = orders.filter(
        (o) => !['delivered', 'rejected', 'cancelled'].includes(o.status),
      )
      const critical = active.filter((o) => o.priority === 'critical')
      return {
        stats: {
          activeOrders: active.length,
          criticalOrders: critical.length,
          deliveredToday: orders.filter((o) => o.status === 'delivered').length,
          nearbySuppliers: 7,
        },
        activeOrders: active,
        recentOrders: orders.filter((o) => o.status === 'delivered').slice(0, 3),
      }
    }, 200)
  },
}
