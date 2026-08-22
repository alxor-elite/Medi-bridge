import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search as SearchIcon, Info } from 'lucide-react'
import { EmergencySearch } from '../../components/hospital/EmergencySearch'
import { SupplierList } from '../../components/hospital/SupplierList'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAsync } from '../../hooks/useAsync'
import { hospitalsApi } from '../../api'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const medId = params.get('med') || ''
  const qty = Number(params.get('qty')) || 20
  const priority = params.get('priority') || 'critical'

  const { data: result, loading, error, run } = useAsync(
    () => (medId ? hospitalsApi.findSuppliers(medId, qty) : Promise.resolve(null)),
    [medId, qty],
  )

  function onSubmit(medicine, { query, quantity, priority: p }) {
    const next = new URLSearchParams()
    if (medicine) next.set('med', medicine.id)
    else if (query) next.set('q', query)
    next.set('qty', quantity)
    next.set('priority', p)
    setParams(next)
  }

  function onReserve(supplier) {
    navigate('/hospital/create-order', {
      state: {
        supplierId: supplier.supplierId,
        supplier,
        medicine: result?.medicine,
        quantity: result?.requested ?? qty,
        priority,
      },
    })
  }

  const detailsToFor = (s) =>
    `/hospital/supplier/${s.supplierId}?med=${medId}&qty=${result?.requested ?? qty}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Search supplies</h1>
        <p className="mt-1 text-sm text-slate-500">
          Find verified suppliers that can fulfil an emergency request.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <EmergencySearch
          key={`${medId}:${result?.medicine?.id || 'none'}`}
          defaultQuery={result?.medicine?.name || params.get('q') || ''}
          defaultQuantity={qty}
          defaultPriority={priority}
          onSubmit={onSubmit}
          autoFocus={!medId}
        />
      </Card>

      {result?.medicine && !loading && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm text-slate-500">Showing suppliers for</span>
          <span className="text-base font-semibold text-slate-900">{result.medicine.name}</span>
          <span className="text-sm text-slate-500">
            · {result.medicine.generic} · requested {result.requested} {result.medicine.unit || 'units'}
          </span>
        </div>
      )}

      {!medId && !loading ? (
        <Card>
          <EmptyState
            icon={SearchIcon}
            title="Search to see verified suppliers"
            description="Enter a medicine or equipment name above. We’ll show verified suppliers ranked by distance, delivery time and stock confidence."
          />
        </Card>
      ) : (
        <SupplierList
          result={result}
          loading={loading}
          error={error}
          onRetry={run}
          onReserve={onReserve}
          detailsToFor={detailsToFor}
        />
      )}

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        MediBridge helps you locate and procure supplies. It does not provide clinical advice or
        recommend treatment — verify suitability with your clinical team.
      </p>
    </div>
  )
}
