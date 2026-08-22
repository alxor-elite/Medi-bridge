import { Link } from 'react-router-dom'
import { Eye, Check, X, Building2, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { VerificationBadge } from '../common/Badges'
import { EmptyState } from '../ui/EmptyState'
import { ORG_TYPES } from '../../lib/constants'
import { formatDate } from '../../lib/format'

/**
 * Admin verification queue. Lists organizations awaiting review with
 * View / Approve / Reject actions. Table on desktop, cards on mobile.
 */
export function VerificationTable({ orgs, onApprove, onReject, busyId, detailsToFor }) {
  if (!orgs?.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Verification queue is clear"
        description="Every organization has been reviewed. New submissions will appear here."
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">License</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{o.name}</p>
                  <p className="text-xs text-slate-500">{o.contactName}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{ORG_TYPES[o.type] || o.type}</td>
                <td className="px-4 py-3 text-slate-600">{o.area}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.license}</td>
                <td className="px-4 py-3"><VerificationBadge status={o.verification} /></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {detailsToFor && (
                      <Link
                        to={detailsToFor(o)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Eye className="size-4" /> View
                      </Link>
                    )}
                    {o.verification === 'pending' && (
                      <>
                        <Button variant="success" size="sm" leftIcon={Check} loading={busyId === o.id} onClick={() => onApprove?.(o)}>
                          Approve
                        </Button>
                        <Button variant="outlineDanger" size="sm" leftIcon={X} disabled={busyId === o.id} onClick={() => onReject?.(o)}>
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 lg:hidden">
        {orgs.map((o) => (
          <li key={o.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Building2 className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{o.name}</p>
                  <p className="text-xs text-slate-500">
                    {ORG_TYPES[o.type] || o.type} · {o.area}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{o.license}</p>
                </div>
              </div>
              <VerificationBadge status={o.verification} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {detailsToFor && (
                <Link
                  to={detailsToFor(o)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="size-4" /> View
                </Link>
              )}
              {o.verification === 'pending' && (
                <>
                  <Button variant="success" size="sm" leftIcon={Check} loading={busyId === o.id} onClick={() => onApprove?.(o)}>
                    Approve
                  </Button>
                  <Button variant="outlineDanger" size="sm" leftIcon={X} disabled={busyId === o.id} onClick={() => onReject?.(o)}>
                    Reject
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
