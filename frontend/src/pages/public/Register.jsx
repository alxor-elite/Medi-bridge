import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Mail,
  Phone,
  FileText,
  MapPin,
  User,
  Lock,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/auth'
import { apiFieldErrors } from '../../api/client'
import { ROLE_HOME } from '../../components/layout/navConfig'

/**
 * Organisation types the backend accepts (ORGANIZATION_TYPES), and the role
 * each one implies. A hospital registers a HOSPITAL account; pharmacies and
 * distributors both trade as SUPPLIER.
 */
const ORG_TYPE_OPTIONS = [
  { id: 'HOSPITAL', label: 'Hospital', role: 'HOSPITAL' },
  { id: 'PHARMACY', label: 'Pharmacy', role: 'SUPPLIER' },
  { id: 'SUPPLIER', label: 'Distributor', role: 'SUPPLIER' },
]

const MIN_PASSWORD_LENGTH = 8

const EMPTY = {
  name: '',
  type: 'PHARMACY',
  contactName: '',
  license: '',
  city: 'Hyderabad',
  area: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
}

/** Backend field paths -> the form fields they belong to. */
const FIELD_MAP = {
  email: 'email',
  password: 'password',
  fullName: 'contactName',
  phone: 'phone',
  'organization.name': 'name',
  'organization.type': 'type',
  'organization.registrationNumber': 'license',
}

export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuth()

  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null) // { organizationName, role }

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
    if (values.password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    if (values.confirmPassword !== values.password) {
      next.confirmPassword = 'Passwords do not match.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  /** Build the POST /api/auth/register body from the form. */
  function toPayload() {
    const orgType = ORG_TYPE_OPTIONS.find((t) => t.id === values.type) || ORG_TYPE_OPTIONS[0]
    const address = [values.area.trim(), values.city.trim()].filter(Boolean).join(', ')
    const phone = values.phone.trim()

    return {
      email: values.email.trim(),
      password: values.password,
      fullName: values.contactName.trim(),
      phone: phone || null,
      role: orgType.role,
      organization: {
        name: values.name.trim(),
        type: orgType.id,
        registrationNumber: values.license.trim(),
        licenseNumber: values.license.trim(),
        email: values.email.trim(),
        phone: phone || null,
        address: address || null,
      },
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      const { user } = await register(toPayload())
      setDone({ organizationName: user.org?.name || values.name, role: user.role })
    } catch (err) {
      // Surface the real backend message, and map field errors back onto the form.
      const fieldErrors = apiFieldErrors(err.cause || err)
      const mapped = {}
      Object.entries(fieldErrors).forEach(([field, message]) => {
        const key = FIELD_MAP[field]
        if (key) mapped[key] = message
      })
      if (Object.keys(mapped).length > 0) setErrors((prev) => ({ ...prev, ...mapped }))
      setFormError(err.message || 'Registration could not be completed.')
    } finally {
      setSubmitting(false)
    }
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
              <p className="font-semibold text-success-800">{done.organizationName}</p>
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
            You’re already signed in — you can transact on the network once approved.
          </li>
        </ol>
        <Button
          fullWidth
          size="lg"
          className="mt-8"
          onClick={() => navigate(ROLE_HOME[done.role] || '/', { replace: true })}
        >
          Continue to dashboard
        </Button>
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
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-3 text-sm font-medium text-danger-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}

        <Field label="Organization name" htmlFor="reg-name" required error={errors.name}>
          <Input id="reg-name" leftIcon={Building2} value={values.name} invalid={!!errors.name}
            placeholder="e.g. Sunrise Multispeciality Hospital" onChange={(e) => set('name', e.target.value)} />
        </Field>


        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="reg-type" error={errors.type}>
            <Select
              id="reg-type"
              value={values.type}
              invalid={!!errors.type}
              onChange={(e) => set('type', e.target.value)}
            >
              {ORG_TYPE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
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
            <Input id="reg-area" value={values.area} placeholder="e.g. Somajiguda"
              onChange={(e) => set('area', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" htmlFor="reg-email" required error={errors.email}>
            <Input id="reg-email" type="email" leftIcon={Mail} value={values.email} invalid={!!errors.email}
              autoComplete="username" placeholder="ops@example.com" onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="reg-phone" error={errors.phone}>
            <Input id="reg-phone" leftIcon={Phone} value={values.phone} invalid={!!errors.phone}
              placeholder="+91…" onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Password"
            htmlFor="reg-password"
            required
            error={errors.password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          >
            <Input id="reg-password" type="password" leftIcon={Lock} value={values.password}
              invalid={!!errors.password} autoComplete="new-password" placeholder="••••••••"
              onChange={(e) => set('password', e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="reg-confirm" required error={errors.confirmPassword}>
            <Input id="reg-confirm" type="password" leftIcon={Lock} value={values.confirmPassword}
              invalid={!!errors.confirmPassword} autoComplete="new-password" placeholder="••••••••"
              onChange={(e) => set('confirmPassword', e.target.value)} />
          </Field>
        </div>

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Submit for verification
        </Button>
      </form>
    </AuthLayout>
  )
}
