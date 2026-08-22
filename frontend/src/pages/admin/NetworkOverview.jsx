import { useMemo } from 'react'
import { Building2, ShieldCheck, Siren, Truck, Hospital, Pill, Store, Boxes } from 'lucide-react'
import { StatsCards } from '../../components/admin/StatsCards'
import { ActivityFeed } from '../../components/admin/ActivityFeed'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAsync } from '../../hooks/useAsync'
import { adminApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatNumber } from '../../lib/format'
import { cn } from '../../lib/cn'

const TYPE_META = {
  hospital: { icon: Hospital, tone: 'bg-brand-500' },
  pharmacy: { icon: Pill, tone: 'bg-teal-500' },
  medical_store: { icon: Store, tone: 'bg-teal-500' },
  supplier: { icon: Boxes, tone: 'bg-slate-400' },
}

const VERIFY_ROWS = [
  { id: 'verified', label: 'Verified', tone: 'bg-success-500' },
  { id: 'pending', label: 'Pending', tone: 'bg-warning-500' },
  { id: 'suspended', label: 'Suspended', tone: 'bg-slate-400' },
  { id: 'rejected', label: 'Rejected', tone: 'bg-danger-500' },
]

function DistRow({ label, icon: Icon, value, total, tone, sub }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-slate-700">
          {Icon && <Icon className="size-4 text-slate-400" aria-hidden="true" />}
          {label}
        </span>
        <span className="tabular-nums text-slate-500">
          <span className="font-semibold text-slate-900">{formatNumber(value)}</span>
          {sub ? ` · ${sub}` : ''}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function NetworkOverview() {
  const dash = useAsync(() => adminApi.getDashboard(), [])
  const orgsQ = useAsync(() => adminApi.listOrganizations('all'), [])

  const stats = dash.data?.stats
  const activity = dash.data?.activity || []
  const orgs = orgsQ.data || []
  const total = orgs.length

  const byType = useMemo(
    () =>
      Object.keys(ORG_TYPES).map((type) => {
        const list = orgs.filter((o) => o.type === type)
        return {
          type,
          count: list.length,
          verified: list.filter((o) => o.verification === 'verified').length,
        }
      }),
    [orgs],
  )

  const byStatus = useMemo(
    () => VERIFY_ROWS.map((r) => ({ ...r, count: orgs.filter((o) => o.verification === r.id).length })),
    [orgs],
  )

  const statItems = stats
    ? [
        { key: 'orgs', icon: Building2, tone: 'brand', label: 'Organizations', value: stats.totalOrganizations },
        { key: 'verified', icon: ShieldCheck, tone: 'success', label: 'Verified', value: stats.verified },
        { key: 'emergency', icon: Siren, tone: 'danger', label: 'Active emergencies', value: stats.activeEmergencyOrders },
        { key: 'transit', icon: Truck, tone: 'accent', label: 'In transit', value: stats.deliveriesInProgress },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Network overview</h1>
        <p className="mt-1 text-sm text-slate-500">Composition and health of the MediBridge supply network.</p>
      </div>

      {dash.loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : dash.error ? (
        <Card><ErrorState onRetry={dash.run} /></Card>
      ) : (
        <StatsCards items={statItems} columns={4} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Coverage by type</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {orgsQ.loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)
              ) : orgsQ.error ? (
                <ErrorState onRetry={orgsQ.run} />
              ) : (
                byType.map((t) => (
                  <DistRow
                    key={t.type}
                    label={ORG_TYPES[t.type]}
                    icon={TYPE_META[t.type]?.icon}
                    value={t.count}
                    total={total}
                    tone={TYPE_META[t.type]?.tone || 'bg-slate-400'}
                    sub={`${t.verified} verified`}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Verification status</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {orgsQ.loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)
              ) : orgsQ.error ? (
                <ErrorState onRetry={orgsQ.run} />
              ) : (
                byStatus.map((s) => (
                  <DistRow key={s.id} label={s.label} value={s.count} total={total} tone={s.tone} />
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Network activity</CardTitle></CardHeader>
          <CardBody>
            {dash.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <ActivityFeed items={activity} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
