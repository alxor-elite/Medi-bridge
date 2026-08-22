import { Pencil, Trash2, Boxes } from 'lucide-react'
import { InventoryStatusBadge } from '../common/Badges'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { formatDate, formatNumber, timeAgo, formatCurrency } from '../../lib/format'
import { cn } from '../../lib/cn'

function StockCell({ item }) {
  const low = item.status?.id === 'low' || item.status?.id === 'out'
  return (
    <span className={cn('font-semibold tabular-nums', low ? 'text-warning-800' : 'text-slate-900')}>
      {formatNumber(item.stock)}
    </span>
  )
}

/**
 * Supplier inventory table: Medicine | Stock | Batch | Expiry | Last Updated |
 * Status. A real table on desktop; stacked cards on mobile.
 */
export function InventoryTable({ items, onEdit, onDelete }) {
  if (!items?.length) {
    return (
      <EmptyState
        icon={Boxes}
        title="No inventory yet"
        description="Add your first medicine or equipment item to start receiving emergency orders."
      />
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Medicine</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Batch</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Last Updated</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.form}</p>
                </td>
                <td className="px-4 py-3">
                  <StockCell item={item} />
                  {item.price ? (
                    <span className="block text-xs text-slate-400">{formatCurrency(item.price)}/unit</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.batch || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(item.expiry)}</td>
                <td className="px-4 py-3 text-slate-500">{timeAgo(item.lastUpdated)}</td>
                <td className="px-4 py-3">
                  <InventoryStatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${item.name}`} onClick={() => onEdit?.(item)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${item.name}`}
                      className="text-danger-600 hover:bg-danger-50"
                      onClick={() => onDelete?.(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">{item.form} · Batch {item.batch || '—'}</p>
              </div>
              <InventoryStatusBadge status={item.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Stock</dt>
                <dd><StockCell item={item} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Expiry</dt>
                <dd className="text-slate-700">{formatDate(item.expiry)}</dd>
              </div>
              <div className="col-span-2 flex justify-between">
                <dt className="text-slate-500">Updated</dt>
                <dd className="text-slate-700">{timeAgo(item.lastUpdated)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" leftIcon={Pencil} onClick={() => onEdit?.(item)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={Trash2}
                className="text-danger-600 hover:bg-danger-50"
                onClick={() => onDelete?.(item)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
