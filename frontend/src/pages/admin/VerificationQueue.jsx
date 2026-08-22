import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { VerificationTable } from '../../components/admin/VerificationTable'
import { RejectDialog } from '../../components/admin/RejectDialog'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAsync } from '../../hooks/useAsync'
import { adminApi } from '../../api'

export default function VerificationQueue() {
  const { data: orgs, loading, error, run } = useAsync(() => adminApi.getVerificationQueue(), [])
  const [busyId, setBusyId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejecting, setRejecting] = useState(false)

  const pendingCount = (orgs || []).filter((o) => o.verification === 'pending').length

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verification queue</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading…' : `${pendingCount} organization${pendingCount === 1 ? '' : 's'} awaiting review`}
          </p>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={run} />
        ) : (
          <VerificationTable
            orgs={orgs}
            busyId={busyId}
            onApprove={approve}
            onReject={setRejectTarget}
            detailsToFor={(o) => `/admin/organizations/${o.id}`}
          />
        )}
      </Card>

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
