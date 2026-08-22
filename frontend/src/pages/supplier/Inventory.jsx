import { useMemo, useState } from 'react'
import { Plus, Search, Boxes, AlertTriangle, CalendarClock, PackageX } from 'lucide-react'
import { InventoryTable } from '../../components/supplier/InventoryTable'
import { InventoryForm } from '../../components/supplier/InventoryForm'
import { StatsCards } from '../../components/admin/StatsCards'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAsync } from '../../hooks/useAsync'
import { inventoryApi } from '../../api'

export default function Inventory() {
  const { data: items, loading, error, run } = useAsync(() => inventoryApi.list(), [])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // { mode: 'add' | 'edit', item? }
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const metrics = useMemo(() => {
    const list = items || []
    return {
      total: list.length,
      low: list.filter((i) => i.status?.id === 'low').length,
      expiring: list.filter((i) => i.status?.id === 'expiring').length,
      out: list.filter((i) => i.status?.id === 'out').length,
    }
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = items || []
    if (!q) return list
    return list.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.batch || '').toLowerCase().includes(q),
    )
  }, [items, query])

  async function handleSubmit(values) {
    setSubmitting(true)
    try {
      if (modal?.mode === 'edit') await inventoryApi.update(modal.item.id, values)
      else await inventoryApi.add(values)
      await run()
      setModal(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await inventoryApi.remove(deleteTarget.id)
      await run()
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const statItems = [
    { key: 'total', icon: Boxes, tone: 'brand', label: 'Total items', value: metrics.total },
    { key: 'low', icon: AlertTriangle, tone: 'warning', label: 'Low stock', value: metrics.low },
    { key: 'exp', icon: CalendarClock, tone: 'warning', label: 'Expiring soon', value: metrics.expiring },
    { key: 'out', icon: PackageX, tone: 'danger', label: 'Out of stock', value: metrics.out },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Keep stock levels current so hospitals see accurate availability.
          </p>
        </div>
        <Button leftIcon={Plus} onClick={() => setModal({ mode: 'add' })}>Add medicine</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <StatsCards items={statItems} columns={4} />
      )}

      <Card>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Input
              leftIcon={Search}
              placeholder="Search by name or batch…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search inventory"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={run} />
        ) : (
          <InventoryTable
            items={filtered}
            onEdit={(item) => setModal({ mode: 'edit', item })}
            onDelete={(item) => setDeleteTarget(item)}
          />
        )}
      </Card>

      {/* Add / edit */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? 'Edit item' : 'Add medicine / equipment'}
        description="Accurate stock keeps your listings trustworthy during emergencies."
        size="lg"
      >
        {modal && (
          <InventoryForm
            initial={modal.item}
            onSubmit={handleSubmit}
            onCancel={() => setModal(null)}
            submitting={submitting}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete item"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold text-slate-900">{deleteTarget?.name}</span> from your
          inventory? Hospitals will no longer see it in search.
        </p>
      </Modal>
    </div>
  )
}
