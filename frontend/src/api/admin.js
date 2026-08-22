/** Admin API (mocked): verification, organizations, monitoring, audit. */
import { mockResolve, minsAgoToIso } from './client'
import { ORGANIZATIONS, ORG_MAP } from '../data/organizations'
import { AUDIT_LOGS, NETWORK_ACTIVITY } from '../data/activity'
import { notificationsForRole } from '../data/notifications'
import { ordersApi } from './orders'

// In-memory org store so approve/reject persists during the demo session.
const orgStore = ORGANIZATIONS.map((o) => ({ ...o }))
const auditStore = AUDIT_LOGS.map((l) => ({ ...l }))

function counts() {
  const by = (status) => orgStore.filter((o) => o.verification === status).length
  return {
    totalOrganizations: orgStore.length,
    verified: by('verified'),
    pending: by('pending'),
    suspended: by('suspended'),
    rejected: by('rejected'),
  }
}

export const adminApi = {
  async getDashboard() {
    const orders = await ordersApi.listAll()
    return mockResolve(() => {
      const c = counts()
      const active = orders.filter(
        (o) => !['delivered', 'rejected', 'cancelled'].includes(o.status),
      )
      return {
        stats: {
          ...c,
          activeEmergencyOrders: active.filter((o) => o.priority !== 'normal').length,
          deliveriesInProgress: active.filter((o) =>
            ['dispatched', 'out_for_delivery'].includes(o.status),
          ).length,
        },
        pendingQueue: orgStore
          .filter((o) => o.verification === 'pending')
          .map((o) => ({ ...o, submittedAt: minsAgoToIso(0) })),
        activity: NETWORK_ACTIVITY.map((a) => ({ ...a, at: minsAgoToIso(a.minsAgo) })),
      }
    }, 220)
  },

  getVerificationQueue() {
    return mockResolve(() =>
      orgStore
        .filter((o) => ['pending', 'rejected'].includes(o.verification))
        .map((o) => ({ ...o })),
    )
  },

  listOrganizations(filter = 'all') {
    return mockResolve(() =>
      orgStore
        .filter((o) => filter === 'all' || o.verification === filter)
        .map((o) => ({ ...o })),
    )
  },

  getOrganization(id) {
    return mockResolve(() => {
      const o = orgStore.find((x) => x.id === id) || ORG_MAP[id]
      return o ? { ...o } : null
    }, 250)
  },

  approve(orgId) {
    return mockResolve(() => {
      const o = orgStore.find((x) => x.id === orgId)
      if (!o) throw new Error('Organization not found')
      o.verification = 'verified'
      auditStore.unshift({
        id: `log-${auditStore.length + 1}`,
        actor: 'admin@medibridge',
        action: 'approved',
        target: o.name,
        type: 'verification',
        minsAgo: 0,
      })
      return { ...o }
    }, 450)
  },

  reject(orgId, reason) {
    return mockResolve(() => {
      const o = orgStore.find((x) => x.id === orgId)
      if (!o) throw new Error('Organization not found')
      o.verification = 'rejected'
      o.rejectedReason = reason || 'Did not meet verification requirements.'
      auditStore.unshift({
        id: `log-${auditStore.length + 1}`,
        actor: 'admin@medibridge',
        action: 'rejected',
        target: o.name,
        type: 'verification',
        minsAgo: 0,
        note: reason,
      })
      return { ...o }
    }, 450)
  },

  listAllOrders() {
    return ordersApi.listAll()
  },

  getAuditLogs() {
    return mockResolve(() =>
      auditStore
        .slice()
        .sort((a, b) => a.minsAgo - b.minsAgo)
        .map((l) => ({ ...l, at: minsAgoToIso(l.minsAgo) })),
    )
  },

  getNotifications() {
    return mockResolve(() =>
      notificationsForRole('admin')
        .map((n) => ({ ...n, at: minsAgoToIso(n.minsAgo) }))
        .sort((a, b) => a.minsAgo - b.minsAgo),
    )
  },
}
