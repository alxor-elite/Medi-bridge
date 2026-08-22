import { useState } from 'react'
import { Field, Input, Select } from '../ui/Input'
import { Button } from '../ui/Button'

const FORMS = ['Injection', 'Vial', 'IV Bag', 'Inhaler', 'Cylinder', 'Device', 'Blood Bag', 'Box', 'Tablet']

const EMPTY = {
  name: '',
  form: 'Injection',
  stock: '',
  lowStockThreshold: 20,
  batch: '',
  expiry: '',
  price: '',
}

/**
 * Add / edit an inventory item. Minimal client-side validation; the parent
 * handles persistence via the inventory API.
 */
export function InventoryForm({ initial, onSubmit, onCancel, submitting }) {
  const [values, setValues] = useState({ ...EMPTY, ...normalise(initial) })
  const [errors, setErrors] = useState({})

  function set(key, value) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const next = {}
    if (!values.name.trim()) next.name = 'Name is required.'
    if (values.stock === '' || Number(values.stock) < 0) next.stock = 'Enter a valid stock quantity.'
    if (values.price !== '' && Number(values.price) < 0) next.price = 'Price cannot be negative.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    onSubmit?.({
      ...values,
      stock: Number(values.stock),
      lowStockThreshold: Number(values.lowStockThreshold) || 20,
      price: values.price === '' ? null : Number(values.price),
    })
  }

  return (
    <form id="inventory-form" onSubmit={handleSubmit} className="space-y-4">
      <Field label="Medicine / equipment name" htmlFor="inv-name" required error={errors.name}>
        <Input
          id="inv-name"
          value={values.name}
          invalid={!!errors.name}
          placeholder="e.g. Adrenaline 1mg/mL"
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Form" htmlFor="inv-form">
          <Select id="inv-form" value={values.form} onChange={(e) => set('form', e.target.value)}>
            {FORMS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Stock quantity" htmlFor="inv-stock" required error={errors.stock}>
          <Input
            id="inv-stock"
            type="number"
            min={0}
            value={values.stock}
            invalid={!!errors.stock}
            placeholder="0"
            onChange={(e) => set('stock', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Low-stock threshold" htmlFor="inv-threshold" hint="Alert when stock falls to this level">
          <Input
            id="inv-threshold"
            type="number"
            min={0}
            value={values.lowStockThreshold}
            onChange={(e) => set('lowStockThreshold', e.target.value)}
          />
        </Field>
        <Field label="Unit price (₹)" htmlFor="inv-price" error={errors.price}>
          <Input
            id="inv-price"
            type="number"
            min={0}
            value={values.price}
            invalid={!!errors.price}
            placeholder="Optional"
            onChange={(e) => set('price', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Batch number" htmlFor="inv-batch">
          <Input
            id="inv-batch"
            value={values.batch}
            placeholder="e.g. ADR-2404-A"
            onChange={(e) => set('batch', e.target.value)}
          />
        </Field>
        <Field label="Expiry date" htmlFor="inv-expiry">
          <Input id="inv-expiry" type="date" value={values.expiry || ''} onChange={(e) => set('expiry', e.target.value)} />
        </Field>
      </div>

      {/* Actions render in the modal footer via portal; keep inline fallback hidden */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {initial ? 'Save changes' : 'Add item'}
        </Button>
      </div>
    </form>
  )
}

function normalise(initial) {
  if (!initial) return {}
  return {
    name: initial.name ?? '',
    form: initial.form || 'Injection',
    stock: initial.stock ?? '',
    lowStockThreshold: initial.lowStockThreshold ?? 20,
    batch: initial.batch ?? '',
    expiry: initial.expiry ?? '',
    price: initial.price ?? '',
  }
}
