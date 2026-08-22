/**
 * Domain constants shared across roles: order lifecycle, priorities,
 * inventory + verification states, and their badge presentation.
 */

export const ROLES = {
  HOSPITAL: 'hospital',
  SUPPLIER: 'supplier',
  ADMIN: 'admin',
}

/** Emergency order priorities. */
export const PRIORITIES = [
  {
    id: 'critical',
    label: 'Critical',
    description: 'Life-threatening — immediate dispatch',
    badge: 'danger',
    dot: 'bg-danger-500',
  },
  {
    id: 'urgent',
    label: 'Urgent',
    description: 'Needed within the hour',
    badge: 'warning',
    dot: 'bg-warning-500',
  },
  {
    id: 'normal',
    label: 'Normal',
    description: 'Standard restock timeline',
    badge: 'brand',
    dot: 'bg-brand-500',
  },
]

export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]))

/** Ordered order lifecycle used by the tracking timeline. */
export const ORDER_STATUSES = [
  { id: 'requested', label: 'Requested', description: 'Order sent to supplier' },
  { id: 'accepted', label: 'Accepted', description: 'Supplier confirmed availability' },
  { id: 'preparing', label: 'Preparing', description: 'Items being packed' },
  { id: 'dispatched', label: 'Dispatched', description: 'Left the supplier' },
  { id: 'out_for_delivery', label: 'Out for Delivery', description: 'On the way to you' },
  { id: 'delivered', label: 'Delivered', description: 'Received at destination' },
]

export const ORDER_STATUS_MAP = Object.fromEntries(
  ORDER_STATUSES.map((s, i) => [s.id, { ...s, index: i }]),
)

/** Badge variant per order status. */
export const ORDER_STATUS_BADGE = {
  requested: 'neutral',
  accepted: 'brand',
  preparing: 'brand',
  dispatched: 'accent',
  out_for_delivery: 'accent',
  delivered: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

/** Inventory stock states. */
export const INVENTORY_STATUS = {
  available: { id: 'available', label: 'Available', badge: 'success' },
  low: { id: 'low', label: 'Low Stock', badge: 'warning' },
  expiring: { id: 'expiring', label: 'Expiring Soon', badge: 'warning' },
  out: { id: 'out', label: 'Out of Stock', badge: 'danger' },
}

/** Organization verification states (admin). */
export const VERIFICATION_STATUS = {
  verified: { id: 'verified', label: 'Verified', badge: 'success' },
  pending: { id: 'pending', label: 'Pending', badge: 'warning' },
  rejected: { id: 'rejected', label: 'Rejected', badge: 'danger' },
  suspended: { id: 'suspended', label: 'Suspended', badge: 'neutral' },
}

export const ORG_TYPES = {
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  medical_store: 'Medical Store',
  supplier: 'Distributor',
}

/**
 * Derive an inventory item's status from its own fields so mock data and
 * any future API payload stay consistent.
 */
export function deriveInventoryStatus(item) {
  if (item.stock <= 0) return INVENTORY_STATUS.out
  const days = item.expiryDays
  if (days != null && days <= 60) return INVENTORY_STATUS.expiring
  if (item.stock <= item.lowStockThreshold) return INVENTORY_STATUS.low
  return INVENTORY_STATUS.available
}
