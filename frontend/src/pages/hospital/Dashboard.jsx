import { useNavigate, Link } from 'react-router-dom'
import {
  ClipboardList,
  Flame,
  PackageCheck,
  Store,
  Search,
  ArrowRight,
  MapPin,
  Clock,
  ShieldCheck,
} from 'lucide-react'
import { EmergencySearch } from '../../components/hospital/EmergencySearch'
import { HospitalOrderCard } from '../../components/hospital/HospitalOrderCard'
import { EmergencyBanner } from '../../components/hospital/EmergencyBanner'
import { StatsCards } from '../../components/admin/StatsCards'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { hospitalsApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatDistance, formatEta } from '../../lib/format'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const orgId = user?.org?.id || 'org-city-general'

  const { data, loading } = useAsync(() => hospitalsApi.getDashboard(orgId), [orgId])
  const { data: nearby, loading: nearbyLoading } = useAsync(() => hospitalsApi.nearbySuppliers(5), [])

  const stats = data?.stats
  const activeOrders = data?.activeOrders || []
  const recentOrders = data?.recentOrders || []

  function onSearch(medicine, { query, quantity, priority }) {
    const params = new URLSearchParams()
    if (medicine) params.set('med', medicine.id)
    else if (query) params.set('q', query)
    params.set('qty', quantity)
    params.set('priority', priority)
    navigate(`/hospital/search?${params.toString()}`)
  }

  const statItems = stats
    ? [
        { key: 'active', icon: ClipboardList, tone: 'brand', label: 'Active Orders', value: stats.activeOrders },
        { key: 'critical', icon: Flame, tone: 'danger', label: 'Critical Orders', value: stats.criticalOrders },
        { key: 'delivered', icon: PackageCheck, tone: 'success', label: 'Delivered', value: stats.deliveredToday },
        { key: 'nearby', icon: Store, tone: 'accent', label: 'Nearby Suppliers', value: stats.nearbySuppliers, suffix: '+' },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome back, {user?.name?.split(' ').slice(0, 2).join(' ')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{user?.org?.name} · Emergency procurement</p>
      </div>

      {/* Emergency search — the primary action */}
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Search className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Find emergency supplies</h2>
            <p className="text-xs text-slate-500">Search verified suppliers by medicine or equipment</p>
          </div>
        </div>
        <EmergencySearch onSubmit={onSearch} />
      </Card>

      {stats?.criticalOrders > 0 && (
        <EmergencyBanner
          tone="critical"
          title={`${stats.criticalOrders} critical ${stats.criticalOrders === 1 ? 'order is' : 'orders are'} in progress`}
          action={
            <Link to="/hospital/orders">
              <Button variant="danger" size="sm">Track now</Button>
            </Link>
          }
        >
          Monitor delivery status closely and escalate if ETAs slip.
        </EmergencyBanner>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <StatsCards items={statItems} columns={4} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Orders */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Active orders</CardTitle>
              <Link to="/hospital/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                View all <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </CardHeader>
            <CardBody className="space-y-3">
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28" />)
              ) : activeOrders.length ? (
                activeOrders.map((o) => <HospitalOrderCard key={o.id} order={o} />)
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No active orders"
                  description="When you place an emergency order it will appear here for tracking."
                  action={
                    <Link to="/hospital/search"><Button leftIcon={Search}>Start a search</Button></Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          {recentOrders.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recently delivered</CardTitle></CardHeader>
              <CardBody className="space-y-3">
                {recentOrders.map((o) => <HospitalOrderCard key={o.id} order={o} />)}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Nearby suppliers */}
        <Card className="h-fit">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Nearby verified suppliers</CardTitle>
            <Link to="/hospital/map" aria-label="Open map" className="text-brand-600 hover:text-brand-700">
              <MapPin className="size-4" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardBody className="space-y-1">
            {nearbyLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)
            ) : (
              (nearby || []).map((s) => (
                <Link
                  key={s.id}
                  to={`/hospital/supplier/${s.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Store className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900">{s.name}</span>
                      <ShieldCheck className="size-3.5 shrink-0 text-success-500" aria-hidden="true" />
                    </span>
                    <span className="block text-xs text-slate-500">{ORG_TYPES[s.type]} · {s.area}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-medium text-slate-700">{formatDistance(s.distanceKm)}</span>
                    <span className="flex items-center gap-0.5 text-xs text-slate-400">
                      <Clock className="size-3" aria-hidden="true" />{formatEta(s.etaMinutes)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
