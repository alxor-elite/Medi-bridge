/** Supplier inventory API (mocked) with in-memory CRUD for the demo session. */
import { mockResolve, minsAgoToIso } from './client'
import { SUPPLIER_INVENTORY } from '../data/inventory'
import { deriveInventoryStatus, INVENTORY_STATUS } from '../lib/constants'
import { daysUntil } from '../lib/format'

const store = SUPPLIER_INVENTORY.map((i) => ({ ...i }))
let seq = 100

function resolve(item) {
  return {
    ...item,
    lastUpdated: minsAgoToIso(item.updatedMinsAgo),
    status: deriveInventoryStatus(item),
  }
}

function computeMetrics(items) {
  return {
    totalItems: items.length,
    totalUnits: items.reduce((s, i) => s + i.stock, 0),
    lowStock: items.filter((i) => i.status.id === INVENTORY_STATUS.low.id).length,
    expiringSoon: items.filter((i) => i.status.id === INVENTORY_STATUS.expiring.id).length,
    outOfStock: items.filter((i) => i.status.id === INVENTORY_STATUS.out.id).length,
  }
}

export const inventoryApi = {
  list() {
    return mockResolve(() => store.map(resolve))
  },

  metrics() {
    return mockResolve(() => computeMetrics(store.map(resolve)))
  },

  add(payload) {
    return mockResolve(() => {
      seq += 1
      const item = {
        id: `inv-new-${seq}`,
        medicineId: payload.medicineId || null,
        name: payload.name,
        form: payload.form || '',
        stock: Number(payload.stock) || 0,
        lowStockThreshold: Number(payload.lowStockThreshold) || 20,
        batch: payload.batch || '',
        expiry: payload.expiry || null,
        expiryDays: payload.expiry ? daysUntil(payload.expiry) : null,
        price: payload.price != null ? Number(payload.price) : null,
        updatedMinsAgo: 0,
      }
      store.unshift(item)
      return resolve(item)
    }, 550)
  },

  update(id, patch) {
    return mockResolve(() => {
      const item = store.find((i) => i.id === id)
      if (!item) throw new Error('Item not found')
      Object.assign(item, patch)
      if (patch.expiry) item.expiryDays = daysUntil(patch.expiry)
      item.updatedMinsAgo = 0
      return resolve(item)
    }, 400)
  },

  remove(id) {
    return mockResolve(() => {
      const idx = store.findIndex((i) => i.id === id)
      if (idx >= 0) store.splice(idx, 1)
      return true
    }, 350)
  },
}
