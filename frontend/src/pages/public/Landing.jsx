import { Link } from 'react-router-dom'
import {
  Search,
  ShieldCheck,
  BookmarkCheck,
  Truck,
  Building2,
  Pill,
  Siren,
  Timer,
  ArrowRight,
  Hospital,
  Store,
  CheckCircle2,
} from 'lucide-react'
import { PublicNavbar } from '../../components/layout/PublicNavbar'
import { Footer } from '../../components/layout/Footer'
import { HeroNetwork } from '../../components/marketing/HeroNetwork'
import { StatCard } from '../../components/ui/StatCard'
import { Card } from '../../components/ui/Card'
import { Reveal } from '../../components/ui/Reveal'
import { buttonVariants } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { LANDING_STATS, LANDING_FEATURES, HOW_IT_WORKS } from '../../data/stats'
import { cn } from '../../lib/cn'

const STAT_ICONS = { orgs: Building2, medicines: Pill, emergencies: Siren, match: Timer }
const STAT_TONES = { orgs: 'brand', medicines: 'accent', emergencies: 'danger', match: 'success' }
const FEATURE_ICONS = { search: Search, verify: ShieldCheck, reserve: BookmarkCheck, track: Truck }

const ROLES = [
  { icon: Hospital, title: 'Hospitals', body: 'Search, compare and reserve emergency supplies from the nearest verified source.', tone: 'bg-brand-50 text-brand-600' },
  { icon: Store, title: 'Suppliers & Pharmacies', body: 'Manage live inventory and respond to emergency requests in seconds.', tone: 'bg-success-50 text-success-600' },
  { icon: ShieldCheck, title: 'Administrators', body: 'Verify organizations and monitor network activity from one control center.', tone: 'bg-teal-50 text-teal-600' },
]

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-24">
          <Reveal>
            <Badge variant="danger" size="md" icon={Siren} className="mb-5">
              Emergency medical supply network
            </Badge>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Emergency Medical Supplies.{' '}
              <span className="text-brand-600">Found in Minutes.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-600">
              MediBridge connects verified hospitals and medical suppliers in
              real time to locate critical medicines and equipment from the
              nearest available source.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}>
                <Search className="size-5" />
                Find Medical Supplies
              </Link>
              <Link to="/register" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
                Register Organization
                <ArrowRight className="size-5" />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              {['Verified organizations only', 'Live stock & ETA', 'Reserve before you order'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success-500" />
                  {t}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120} className="hidden lg:block">
            <HeroNetwork />
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto -mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {LANDING_STATS.map((s, i) => (
            <Reveal key={s.key} delay={i * 80}>
              <StatCard
                icon={STAT_ICONS[s.key]}
                tone={STAT_TONES[s.key]}
                label={s.label}
                value={s.value}
                suffix={s.suffix}
                decimals={s.key === 'match' ? 1 : 0}
                hint={s.hint}
              />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Built for the speed emergencies demand
          </h2>
          <p className="mt-3 text-slate-600">
            Every second counts. MediBridge removes the phone calls and guesswork
            from sourcing critical supplies.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_FEATURES.map((f, i) => {
            const Icon = FEATURE_ICONS[f.key]
            return (
              <Reveal key={f.key} delay={i * 80}>
                <Card className="h-full p-6" hover>
                  <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{f.body}</p>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">How it works</h2>
            <p className="mt-3 text-slate-600">From search to delivery in four steps.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal key={step.step} delay={i * 80} className="relative">
                <div className="flex size-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">One network, every role</h2>
          <p className="mt-3 text-slate-600">Tailored experiences for each part of the supply chain.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.title} delay={i * 80}>
              <Card className="flex h-full flex-col p-6" hover>
                <div className={cn('flex size-12 items-center justify-center rounded-xl', r.tone)}>
                  <r.icon className="size-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{r.title}</h3>
                <p className="mt-2 flex-1 text-sm text-slate-600">{r.body}</p>
                <Link to="/login" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  Explore <ArrowRight className="size-4" />
                </Link>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Ready to find supplies faster?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">
            Join the network and reach verified suppliers the moment an emergency hits.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/login" className={buttonVariants({ variant: 'inverse', size: 'lg' })}>
              <Search className="size-5" />
              Find Medical Supplies
            </Link>
            <Link to="/register" className={buttonVariants({ variant: 'onBrand', size: 'lg' })}>
              Register Organization
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
