import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileCheck2,
  ShieldCheck,
  Gauge,
  CalendarClock,
  BedDouble,
  User,
  Check,
  X,
  AlertTriangle,
  Ban,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { VerificationBadge } from '../../components/common/Badges'
import { RejectDialog } from '../../components/admin/RejectDialog'
import { useAsync } from '../../hooks/useAsync'
import { adminApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatDate, formatNumber } from '../../lib/format'

function Detail({ icon: Icon, label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  )
}

export default function OrganizationDetails() {
  const { id } = useParams()
  const { data: org, loading, error, run, setData } = useAsync(() => adminApi.getOrganization(id), [id])
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  async function approve() {
    setBusy(true)
    try {
      const updated = await adminApi.approve(org.id)
      setData(updated)
    } finally {
      setBusy(false)
    }
  }

  async function submitReject(reason) {
    setRejecting(true)
    try {
      const updated = await adminApi.reject(org.id, reason)
      setData(updated)
      setRejectOpen(false)
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        to="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All organizations
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <Card><ErrorState onRetry={run} /></Card>
      ) : !org ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Organization not found"
            description="This organization may have been removed."
            action={<Link to="/admin/organizations"><Button variant="secondary">Back to list</Button></Link>}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Building2 className="size-7" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">{org.name}</h1>
                  <VerificationBadge status={org.verification} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {ORG_TYPES[org.type] || org.type} · {org.area}, {org.city}
                </p>
              </div>
              {org.verification === 'pending' && (
                <div className="flex gap-2">
                  <Button variant="outlineDanger" leftIcon={X} disabled={busy} onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                  <Button variant="success" leftIcon={Check} loading={busy} onClick={approve}>
                    Approve
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          {org.verification === 'rejected' && org.rejectedReason && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-500" aria-hidden="true" />
              <div>
                <p className="font-medium">Rejected</p>
                <p className="mt-0.5 text-danger-700">{org.rejectedReason}</p>
              </div>
            </div>
          )}

          {org.verification === 'suspended' && org.suspendedReason && (
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Ban className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <p className="font-medium text-slate-900">Suspended</p>
                <p className="mt-0.5">{org.suspendedReason}</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardBody>
              <div className="grid gap-5 sm:grid-cols-2">
                <Detail icon={User} label="Primary contact" value={org.contactName} />
                <Detail icon={FileCheck2} label="License" value={org.license} />
                <Detail icon={MapPin} label="Address" value={`${org.address || org.area}, ${org.city}`} />
                <Detail icon={Phone} label="Phone" value={org.phone} />
                <Detail icon={Mail} label="Email" value={org.email} />
                {org.type === 'hospital' && (
                  <Detail icon={BedDouble} label="Beds" value={org.beds != null ? formatNumber(org.beds) : null} />
                )}
                <Detail icon={ShieldCheck} label="Reliability" value={org.reliability != null ? `${org.reliability}%` : null} />
                <Detail icon={Gauge} label="Fulfilment rate" value={org.fulfilmentRate != null ? `${org.fulfilmentRate}%` : null} />
                <Detail icon={CalendarClock} label="On network since" value={org.joinedAt ? formatDate(org.joinedAt) : null} />
                <Detail icon={CalendarClock} label="Submitted" value={org.submittedAt ? formatDate(org.submittedAt) : null} />
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <RejectDialog
        open={rejectOpen}
        org={org}
        onClose={() => setRejectOpen(false)}
        onConfirm={submitReject}
        submitting={rejecting}
      />
    </div>
  )
}
