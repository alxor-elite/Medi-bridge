import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ShieldCheck, Clock, Siren, Truck, ArrowRight } from 'lucide-react'
import { StatsCards } from '../../components/admin/StatsCards'
import { VerificationTable } from '../../components/admin/VerificationTable'
import { ActivityFeed } from '../../components/admin/ActivityFeed'
import { RejectDialog } from '../../components/admin/RejectDialog'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAsync } from '../../hooks/useAsync'
import { adminApi } from '../../api'

export default function Dashboard() {
  const { data, loading, run } = useAsync(() => adminApi.getDashboard(), [])
  const [busyId, setBusyId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejecting, setRejecting] = useState(false)

  const stats = data?.stats
  const queue = data?.pendingQueue || []
  const activity = data?.activity || []

  async function approve(org) {
    setBusyId(org.id)
    try {
      await adminApi.approve(org.id)
      await run()
    } finally {
      setBusyId(null)
    }
  }

  async function submitReject(reason) {
    setRejecting(true)
    try {
      await adminApi.reject(rejectTarget.id, reason)
      await run()
      setRejectTarget(null)
    } finally {
      setRejecting(false)
    }
  }

  const statItems = stats
    ? [
        { key: 'orgs', icon: Building2, tone: 'brand', label: 'Organizations', value: stats.totalOrganizations },
        { key: 'verified', icon: ShieldCheck, tone: 'success', label: 'Verified', value: stats.verified },
        { key: 'pending', icon: Clock, tone: 'warning', label: 'Pending review', value: stats.pending },
        { key: 'emergency', icon: Siren, tone: 'danger', label: 'Active emergencies', value: stats.activeEmergencyOrders },
        { key: 'deliveries', icon: Truck, tone: 'accent', label: 'In transit', value: stats.deliveriesInProgress },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Network overview</h1>
        <p className="mt-1 text-sm text-slate-500">Monitor verification, orders and network health.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <StatsCards items={statItems} columns={5} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Verification queue</CardTitle>
            <Link to="/admin/verification" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </CardHeader>
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <VerificationTable
              orgs={queue}
              busyId={busyId}
              onApprove={approve}
              onReject={setRejectTarget}
              detailsToFor={(o) => `/admin/organizations/${o.id}`}
            />
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>Network activity</CardTitle></CardHeader>
          <CardBody>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <ActivityFeed items={activity} />
            )}
          </CardBody>
        </Card>
      </div>

      <RejectDialog
        open={!!rejectTarget}
        org={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={submitReject}
        submitting={rejecting}
      />
    </div>
  )
}
