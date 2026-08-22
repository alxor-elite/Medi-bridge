import { useNavigate, Link } from 'react-router-dom'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileCheck2,
  ShieldCheck,
  Gauge,
  CalendarClock,
  LogOut,
  Boxes,
  Info,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { VerificationBadge } from '../../components/common/Badges'
import { useAuth } from '../../context/auth'
import { useAsync } from '../../hooks/useAsync'
import { suppliersApi } from '../../api'
import { ORG_TYPES } from '../../lib/constants'
import { formatDate, initials } from '../../lib/format'

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

export default function Profile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const orgId = user?.org?.id || 'org-medplus'
  const { data: org, loading } = useAsync(() => suppliersApi.getProfile(orgId), [orgId])

  async function signOut() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile</h1>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.title}</p>
            <p className="mt-0.5 text-sm text-slate-500">{user?.email}</p>
          </div>
          <Button variant="secondary" leftIcon={LogOut} onClick={signOut}>Sign out</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Organization</CardTitle>
          {org && <VerificationBadge status={org.verification} />}
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : org ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Detail icon={Building2} label="Name" value={org.name} />
                <Detail icon={Building2} label="Type" value={ORG_TYPES[org.type]} />
                <Detail icon={MapPin} label="Address" value={`${org.address || org.area}, ${org.city}`} />
                <Detail icon={FileCheck2} label="License" value={org.license} />
                <Detail icon={Phone} label="Phone" value={org.phone} />
                <Detail icon={Mail} label="Email" value={org.email} />
                <Detail icon={ShieldCheck} label="Reliability" value={org.reliability != null ? `${org.reliability}%` : null} />
                <Detail icon={Gauge} label="Fulfilment rate" value={org.fulfilmentRate != null ? `${org.fulfilmentRate}%` : null} />
                <Detail icon={CalendarClock} label="On network since" value={formatDate(org.joinedAt)} />
              </div>
              <div className="mt-6 border-t border-slate-100 pt-5">
                <Link to="/supplier/inventory">
                  <Button variant="secondary" leftIcon={Boxes}>Manage inventory</Button>
                </Link>
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        MediBridge coordinates supply logistics only. Keep your inventory accurate so hospitals can
        rely on what they see.
      </p>
    </div>
  )
}
