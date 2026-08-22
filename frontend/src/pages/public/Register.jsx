import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Mail, Phone, FileText, MapPin, User, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { ORG_TYPES } from '../../lib/constants'

const EMPTY = {
  name: '',
  type: 'pharmacy',
  contactName: '',
  license: '',
  city: 'Hyderabad',
  area: '',
  email: '',
  phone: '',
}

export default function Register() {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function set(key, value) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const next = {}
    if (!values.name.trim()) next.name = 'Organization name is required.'
    if (!values.contactName.trim()) next.contactName = 'Contact name is required.'
    if (!values.license.trim()) next.license = 'License number is required.'
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next.email = 'Enter a valid email address.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    // Mock submission — a real backend would create a pending organization.
    setTimeout(() => {
      setSubmitting(false)
      setDone(true)
    }, 800)
  }

  if (done) {
    return (
      <AuthLayout title="Registration submitted" subtitle="Your organization is now in the verification queue.">
        <div className="rounded-2xl border border-success-200 bg-success-50 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-success-100 text-success-600">
              <CheckCircle2 className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-success-800">{values.name}</p>
              <p className="text-sm text-success-700">Submitted for verification</p>
            </div>
          </div>
        </div>
        <ol className="mt-6 space-y-3 text-sm text-slate-600">
          <li className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            An administrator reviews your license and organization details.
          </li>
          <li className="flex gap-3">
            <Mail className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            You’ll be notified by email once approved — typically within a day.
          </li>
          <li className="flex gap-3">
            <ArrowRight className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            After approval you can log in and start transacting on the network.
          </li>
        </ol>
        <Link to="/login" className="mt-8 block">
          <Button fullWidth size="lg">Continue to log in</Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Register your organization"
      subtitle="Join the verified network. All organizations are reviewed before they can transact."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Organization name" htmlFor="reg-name" required error={errors.name}>
          <Input id="reg-name" leftIcon={Building2} value={values.name} invalid={!!errors.name}
            placeholder="e.g. City General Hospital" onChange={(e) => set('name', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="reg-type">
            <Select id="reg-type" value={values.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(ORG_TYPES).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="License number" htmlFor="reg-license" required error={errors.license}>
            <Input id="reg-license" leftIcon={FileText} value={values.license} invalid={!!errors.license}
              placeholder="PHRM-TS-…" onChange={(e) => set('license', e.target.value)} />
          </Field>
        </div>

        <Field label="Primary contact" htmlFor="reg-contact" required error={errors.contactName}>
          <Input id="reg-contact" leftIcon={User} value={values.contactName} invalid={!!errors.contactName}
            placeholder="Full name" onChange={(e) => set('contactName', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City" htmlFor="reg-city">
            <Input id="reg-city" leftIcon={MapPin} value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Area / locality" htmlFor="reg-area">
            <Input id="reg-area" value={values.area} placeholder="e.g. Somajiguda" onChange={(e) => set('area', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" htmlFor="reg-email" required error={errors.email}>
            <Input id="reg-email" type="email" leftIcon={Mail} value={values.email} invalid={!!errors.email}
              placeholder="ops@example.com" onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="reg-phone">
            <Input id="reg-phone" leftIcon={Phone} value={values.phone} placeholder="+91…" onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Submit for verification
        </Button>
      </form>
    </AuthLayout>
  )
}
