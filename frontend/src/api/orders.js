/** Orders API (mocked). Shared by hospital (buyer) and supplier (seller). */
import { mockResolve, minsAgoToIso } from './client'
import { ORDERS, orderTotal } from '../data/orders'
import { ORG_MAP } from '../data/organizations'

// In-memory store so orders created/updated during a demo session persist.
const store = ORDERS.map((o) => ({ ...o, timeline: [...o.timeline] }))
let seq = 2500

function orgBrief(id) {
  const o = ORG_MAP[id]
  return o ? { id: o.id, name: o.name, type: o.type, area: o.area, phone: o.phone } : null
}

function resolve(order) {
  return {
    ...order,
    total: orderTotal(order),
    createdAt: minsAgoToIso(order.createdMinsAgo),
    supplier: orgBrief(order.supplierId),
    hospital: orgBrief(order.hospitalId),
    timeline: order.timeline.map((t) => ({ ...t, at: minsAgoToIso(t.minsAgo) })),
  }
}

export const ordersApi = {
  listForHospital(hospitalId) {
    return mockResolve(() =>
      store
        .filter((o) => o.hospitalId === hospitalId)
        .sort((a, b) => a.createdMinsAgo - b.createdMinsAgo)
        .map(resolve),
    )
  },

  listForSupplier(supplierId) {
    return mockResolve(() =>
      store
        .filter((o) => o.supplierId === supplierId)
        .sort((a, b) => a.createdMinsAgo - b.createdMinsAgo)
        .map(resolve),
    )
  },

  /** All orders — used by the admin monitoring view. */
  listAll() {
    return mockResolve(() =>
      [...store].sort((a, b) => a.createdMinsAgo - b.createdMinsAgo).map(resolve),
    )
  },

  get(orderId) {
    return mockResolve(() => {
      const o = store.find((x) => x.id === orderId)
      return o ? resolve(o) : null
    }, 300)
  },

  /** Place a new emergency order (hospital flow). */
  create(payload) {
    return mockResolve(() => {
      seq += 1
      const order = {
        id: `ord-${seq}`,
        code: `MB-${seq}`,
        hospitalId: payload.hospitalId,
        supplierId: payload.supplierId,
        priority: payload.priority || 'normal',
        status: 'requested',
        createdMinsAgo: 0,
        etaMinutes: payload.etaMinutes ?? null,
        courier: null,
        items: payload.items || [],
        timeline: [{ statusId: 'requested', minsAgo: 0, note: 'Order placed' }],
      }
      store.unshift(order)
      return resolve(order)
    }, 650)
  },

  /** Move an order to a new lifecycle status and log it on the timeline. */
  setStatus(orderId, statusId, note) {
    return mockResolve(() => {
      const o = store.find((x) => x.id === orderId)
      if (!o) throw new Error('Order not found')
      o.status = statusId
      o.timeline.push({ statusId, minsAgo: 0, note })
      return resolve(o)
    }, 350)
  },
}
