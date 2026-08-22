/**
 * Admin monitoring data: an audit trail and a network activity feed.
 * `minsAgo` is resolved to timestamps by the API layer.
 */

export const AUDIT_LOGS = [
  { id: 'log-1', actor: 'admin@medibridge', action: 'approved', target: 'Guardian Pharma', type: 'verification', minsAgo: 210 },
  { id: 'log-2', actor: 'admin@medibridge', action: 'rejected', target: 'Rapid Scripts Trading', type: 'verification', minsAgo: 480, note: 'License unverifiable' },
  { id: 'log-3', actor: 'system', action: 'flagged', target: 'Old Town Chemists', type: 'compliance', minsAgo: 180, note: 'Freshness SLA breach ×4' },
  { id: 'log-4', actor: 'admin@medibridge', action: 'suspended', target: 'Old Town Chemists', type: 'compliance', minsAgo: 175 },
  { id: 'log-5', actor: 'ops@citygeneral', action: 'placed order', target: 'MB-2481', type: 'order', minsAgo: 34 },
  { id: 'log-6', actor: 'dispatch@medplus', action: 'accepted request', target: 'ER-903', type: 'order', minsAgo: 26 },
  { id: 'log-7', actor: 'admin@medibridge', action: 'approved', target: 'Nova Medical Supplies', type: 'verification', minsAgo: 1440 },
  { id: 'log-8', actor: 'system', action: 'auto-verified license', target: 'Hopewell Hospital', type: 'system', minsAgo: 2880 },
]

export const NETWORK_ACTIVITY = [
  { id: 'act-1', type: 'order', text: 'City General reserved 20× Adrenaline 1mg from MedPlus', minsAgo: 6 },
  { id: 'act-2', type: 'order', text: 'Hopewell Hospital requested 15× Noradrenaline 4mg', minsAgo: 9 },
  { id: 'act-3', type: 'stock', text: 'Lifeline Distributors restocked Normal Saline (+500)', minsAgo: 22 },
  { id: 'act-4', type: 'verification', text: 'QuickMed Distributors submitted for verification', minsAgo: 40 },
  { id: 'act-5', type: 'delivery', text: 'MB-2470 delivered to City General', minsAgo: 1405 },
]
