/**
 * Orders across the network. `hospitalId` is the buyer, `supplierId` the
 * seller — the same records power both the hospital's "My Orders" and the
 * supplier's "Incoming Orders". Timeline entries use `minsAgo`; the API layer
 * turns those into live timestamps.
 */

export const ORDERS = [
  {
    id: 'ord-2481',
    code: 'MB-2481',
    hospitalId: 'org-city-general',
    supplierId: 'org-medplus',
    priority: 'critical',
    status: 'out_for_delivery',
    createdMinsAgo: 34,
    etaMinutes: 7,
    courier: 'MedPlus Rapid #4',
    items: [
      { medicineId: 'med-adrenaline-1mg', name: 'Adrenaline 1mg/mL', qty: 20, unitPrice: 82 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 34 },
      { statusId: 'accepted', minsAgo: 31, note: 'Confirmed 20 ampoules' },
      { statusId: 'preparing', minsAgo: 26 },
      { statusId: 'dispatched', minsAgo: 12 },
      { statusId: 'out_for_delivery', minsAgo: 6, note: 'Rider en route via Raj Bhavan Rd' },
    ],
  },
  {
    id: 'ord-2479',
    code: 'MB-2479',
    hospitalId: 'org-city-general',
    supplierId: 'org-lifeline-distrib',
    priority: 'urgent',
    status: 'preparing',
    createdMinsAgo: 18,
    etaMinutes: 22,
    courier: null,
    items: [
      { medicineId: 'med-normal-saline-500', name: 'Normal Saline 0.9% 500mL', qty: 60, unitPrice: 42 },
      { medicineId: 'med-ringer-lactate-500', name: 'Ringer Lactate 500mL', qty: 40, unitPrice: 45 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 18 },
      { statusId: 'accepted', minsAgo: 15 },
      { statusId: 'preparing', minsAgo: 8, note: 'Packing 2 line items' },
    ],
  },
  {
    id: 'ord-2477',
    code: 'MB-2477',
    hospitalId: 'org-hopewell-hosp',
    supplierId: 'org-medplus',
    priority: 'critical',
    status: 'accepted',
    createdMinsAgo: 9,
    etaMinutes: 26,
    courier: null,
    items: [
      { medicineId: 'med-noradrenaline-4mg', name: 'Noradrenaline 4mg', qty: 15, unitPrice: 128 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 9 },
      { statusId: 'accepted', minsAgo: 4, note: 'Confirmed — preparing shortly' },
    ],
  },
  {
    id: 'ord-2470',
    code: 'MB-2470',
    hospitalId: 'org-city-general',
    supplierId: 'org-apollo-central',
    priority: 'normal',
    status: 'delivered',
    createdMinsAgo: 1490,
    etaMinutes: 0,
    courier: 'Apollo Logistics',
    items: [
      { medicineId: 'med-ceftriaxone-1g', name: 'Ceftriaxone 1g', qty: 80, unitPrice: 58 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 1490 },
      { statusId: 'accepted', minsAgo: 1485 },
      { statusId: 'preparing', minsAgo: 1470 },
      { statusId: 'dispatched', minsAgo: 1450 },
      { statusId: 'out_for_delivery', minsAgo: 1430 },
      { statusId: 'delivered', minsAgo: 1405, note: 'Signed by ward pharmacist' },
    ],
  },
  {
    id: 'ord-2465',
    code: 'MB-2465',
    hospitalId: 'org-city-general',
    supplierId: 'org-medplus',
    priority: 'urgent',
    status: 'delivered',
    createdMinsAgo: 2880,
    etaMinutes: 0,
    courier: 'MedPlus Rapid #2',
    items: [
      { medicineId: 'med-heparin-5000', name: 'Heparin 5000 IU', qty: 30, unitPrice: 76 },
      { medicineId: 'med-atropine-600', name: 'Atropine 0.6mg', qty: 25, unitPrice: 34 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 2880 },
      { statusId: 'accepted', minsAgo: 2875 },
      { statusId: 'preparing', minsAgo: 2860 },
      { statusId: 'dispatched', minsAgo: 2840 },
      { statusId: 'out_for_delivery', minsAgo: 2820 },
      { statusId: 'delivered', minsAgo: 2795 },
    ],
  },
  {
    id: 'ord-2460',
    code: 'MB-2460',
    hospitalId: 'org-hopewell-hosp',
    supplierId: 'org-medplus',
    priority: 'normal',
    status: 'rejected',
    createdMinsAgo: 320,
    etaMinutes: 0,
    courier: null,
    rejectedReason: 'Requested quantity exceeded available stock at time of order.',
    items: [
      { medicineId: 'med-insulin-100', name: 'Human Insulin 100 IU', qty: 40, unitPrice: 210 },
    ],
    timeline: [
      { statusId: 'requested', minsAgo: 320 },
      { statusId: 'rejected', minsAgo: 305, note: 'Insufficient stock' },
    ],
  },
]

export function ordersForHospital(hospitalId) {
  return ORDERS.filter((o) => o.hospitalId === hospitalId)
}

export function ordersForSupplier(supplierId) {
  return ORDERS.filter((o) => o.supplierId === supplierId)
}

export function orderTotal(order) {
  return order.items.reduce((sum, i) => sum + i.qty * (i.unitPrice || 0), 0)
}
