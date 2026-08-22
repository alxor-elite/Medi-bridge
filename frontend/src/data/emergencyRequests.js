/**
 * Emergency requests arriving at a supplier's inbox (reference supplier
 * MedPlus). These are time-critical asks a supplier can accept or decline.
 * `minsAgo` is resolved to a timestamp by the API layer.
 */

export const EMERGENCY_REQUESTS = [
  {
    id: 'req-901',
    code: 'ER-901',
    supplierId: 'org-medplus',
    fromHospitalId: 'org-city-general',
    medicineId: 'med-adrenaline-1mg',
    name: 'Adrenaline 1mg/mL',
    qty: 20,
    priority: 'critical',
    minsAgo: 3,
    status: 'new',
    note: 'Resus bay running low — need within 15 min.',
  },
  {
    id: 'req-902',
    code: 'ER-902',
    supplierId: 'org-medplus',
    fromHospitalId: 'org-hopewell-hosp',
    medicineId: 'med-noradrenaline-4mg',
    name: 'Noradrenaline 4mg',
    qty: 15,
    priority: 'critical',
    minsAgo: 11,
    status: 'new',
    note: 'ICU vasopressor shortage.',
  },
  {
    id: 'req-903',
    code: 'ER-903',
    supplierId: 'org-medplus',
    fromHospitalId: 'org-city-general',
    medicineId: 'med-ceftriaxone-1g',
    name: 'Ceftriaxone 1g',
    qty: 50,
    priority: 'urgent',
    minsAgo: 26,
    status: 'accepted',
    note: 'Sepsis protocol restock.',
  },
  {
    id: 'req-904',
    code: 'ER-904',
    supplierId: 'org-medplus',
    fromHospitalId: 'org-hopewell-hosp',
    medicineId: 'med-insulin-100',
    name: 'Human Insulin 100 IU',
    qty: 25,
    priority: 'normal',
    minsAgo: 58,
    status: 'declined',
    note: 'Below reorder threshold.',
  },
]

export function emergencyRequestsForSupplier(supplierId) {
  return EMERGENCY_REQUESTS.filter((r) => r.supplierId === supplierId)
}
