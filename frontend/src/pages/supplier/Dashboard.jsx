import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes,
  AlertTriangle,
  CalendarClock,
  Truck,
  Siren,
  ArrowRight,
  PackagePlus,
} from 'lucide-react'
import { OrderCard } from '../../components/supplier/OrderCard'
import { EmergencyBanner } from '../../components/hospital/EmergencyBanner'
import { StatsCards } from '../../components/admin/StatsCards'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { suppliersApi, ordersApi } from '../../api'

export default function Dashboard() {
  const { user } = useAuth()
  const orgId = user?.orgId || null
  const { data, loading, run } = useAsync(() => suppliersApi.getDashboard(orgId), [orgId])
  const [busyId, setBusyId] = useState(null)

  const stats = data?.stats
  const incomingOrders = data?.incomingOrders || []

  async function advance(order, nextId) {
    setBusyId(order.id)
    try {
      await ordersApi.setStatus(order.id, nextId, null)
      await run()
    } finally {
      setBusyId(null)
    }
  }

  async function reject(order) {
    setBusyId(order.id)
    try {
      await ordersApi.setStatus(order.id, 'rejected', 'Rejected by supplier')
      await run()
    } finally {
      setBusyId(null)
    }
  }

  const statItems = stats
    ? [
        { key: 'inv', icon: Boxes, tone: 'brand', label: 'Inventory items', value: stats.inventoryItems },
        { key: 'low', icon: AlertTriangle, tone: 'warning', label: 'Low stock', value: stats.lowStock },
        { key: 'exp', icon: CalendarClock, tone: 'warning', label: 'Expiring soon', value: stats.expiringSoon },
        { key: 'ord', icon: Truck, tone: 'accent', label: 'Active orders', value: stats.activeOrders },
        { key: 'req', icon: Siren, tone: 'danger', label: 'Emergency requests', value: stats.emergencyRequests },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user?.org?.name || 'Supplier'} dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">Fulfil emergency requests and keep stock current.</p>
        </div>
        <Link to="/supplier/inventory"><Button leftIcon={PackagePlus}>Manage inventory</Button></Link>
      </div>

      {stats?.emergencyRequests > 0 && (
        <EmergencyBanner
          tone="critical"
          title={`${stats.emergencyRequests} new emergency ${stats.emergencyRequests === 1 ? 'request' : 'requests'}`}
          action={<Link to="/supplier/emergency"><Button variant="danger" size="sm">Respond</Button></Link>}
        >
          Hospitals are waiting on time-critical supplies. Respond as soon as possible.
        </EmergencyBanner>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <StatsCards items={statItems} columns={5} />
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Incoming orders</CardTitle>
          <Link to="/supplier/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            View all <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardBody className="space-y-4">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44" />)
          ) : incomingOrders.length ? (
            incomingOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                busy={busyId === o.id}
                onAdvance={advance}
                onReject={reject}
                detailsTo={`/supplier/orders/${o.id}`}
              />
            ))
          ) : (
            <EmptyState
              icon={Truck}
              title="No incoming orders"
              description="New emergency orders from hospitals will appear here for you to accept and fulfil."
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
