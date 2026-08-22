import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  XCircle,
  AlertTriangle,
  Flame,
  ShieldCheck,
  ShieldX,
  Ban,
  PackageX,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import {
  ORDER_STATUS_MAP,
  ORDER_STATUS_BADGE,
  PRIORITY_MAP,
  VERIFICATION_STATUS,
} from '../../lib/constants'

const ORDER_ICONS = {
  requested: Clock,
  accepted: CheckCircle2,
  preparing: Package,
  dispatched: Truck,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  rejected: XCircle,
  cancelled: XCircle,
}
const ORDER_FALLBACK = { rejected: 'Rejected', cancelled: 'Cancelled' }

export function OrderStatusBadge({ status, size = 'sm' }) {
  const label = ORDER_STATUS_MAP[status]?.label || ORDER_FALLBACK[status] || status
  return (
    <Badge variant={ORDER_STATUS_BADGE[status] || 'neutral'} size={size} icon={ORDER_ICONS[status]}>
      {label}
    </Badge>
  )
}

const PRIORITY_ICONS = { critical: Flame, urgent: AlertTriangle, normal: Clock }

export function PriorityBadge({ priority, size = 'sm' }) {
  const meta = PRIORITY_MAP[priority]
  if (!meta) return null
  return (
    <Badge
      variant={meta.badge}
      size={size}
      icon={PRIORITY_ICONS[priority]}
      dot={priority === 'critical'}
      pulse={priority === 'critical'}
    >
      {meta.label}
    </Badge>
  )
}

const VERIFY_ICONS = {
  verified: ShieldCheck,
  pending: Clock,
  rejected: ShieldX,
  suspended: Ban,
}

export function VerificationBadge({ status, size = 'sm' }) {
  const meta = VERIFICATION_STATUS[status]
  if (!meta) return null
  return (
    <Badge variant={meta.badge} size={size} icon={VERIFY_ICONS[status]}>
      {meta.label}
    </Badge>
  )
}

const INVENTORY_ICONS = {
  available: CheckCircle2,
  low: AlertTriangle,
  expiring: Clock,
  out: PackageX,
}

export function InventoryStatusBadge({ status, size = 'sm' }) {
  if (!status) return null
  return (
    <Badge variant={status.badge} size={size} icon={INVENTORY_ICONS[status.id]}>
      {status.label}
    </Badge>
  )
}

/** Compact "Verified" tag for supplier cards. */
export function VerifiedTag({ size = 'sm' }) {
  return (
    <Badge variant="success" size={size} icon={ShieldCheck}>
      Verified
    </Badge>
  )
}
