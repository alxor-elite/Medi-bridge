import { Link } from 'react-router-dom'
import { Search, GitCompare, BookmarkCheck, Truck, ShieldCheck, Info, ArrowRight } from 'lucide-react'
import { PublicNavbar } from '../../components/layout/PublicNavbar'
import { Footer } from '../../components/layout/Footer'
import { Card } from '../../components/ui/Card'
import { Reveal } from '../../components/ui/Reveal'
import { EmergencyBanner } from '../../components/hospital/EmergencyBanner'
import { buttonVariants } from '../../components/ui/Button'
import { HOW_IT_WORKS } from '../../data/stats'
import { cn } from '../../lib/cn'

const STEP_ICONS = [Search, GitCompare, BookmarkCheck, Truck]

export default function About() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicNavbar />

      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              How MediBridge works
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              A verified network that turns the scramble of sourcing critical supplies into a
              fast, transparent process — search, compare, reserve, and track.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {HOW_IT_WORKS.map((step, i) => {
            const Icon = STEP_ICONS[i]
            return (
              <Reveal key={step.step} delay={i * 60}>
                <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center" hover>
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Icon className="size-7" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brand-600">Step {step.step}</span>
                    </div>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-1 text-slate-600">{step.body}</p>
                  </div>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* Trust / verification */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2 lg:px-8">
          <div>
            <span className="flex size-11 items-center justify-center rounded-xl bg-success-50 text-success-600">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">Trust is built in</h2>
            <p className="mt-2 text-slate-600">
              Only organizations whose licenses and details have been reviewed and approved can
              appear in search or transact. Every result carries a live reliability score, stock
              freshness, and a blended stock-confidence rating.
            </p>
            <Link to="/verification-info" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              How verification works <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Verified only', 'No unverified organization can transact'],
              ['Live data', 'Stock, distance and ETA update in real time'],
              ['Ranked matches', 'Best source surfaced as “Recommended”'],
              ['Full traceability', 'Every order tracked to delivery'],
            ].map(([t, d]) => (
              <Card key={t} className="p-4">
                <p className="text-sm font-semibold text-slate-900">{t}</p>
                <p className="mt-1 text-xs text-slate-500">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Scope / safety statement (product boundary) */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <EmergencyBanner tone="info" icon={Info} title="What MediBridge is — and isn’t">
          <p className="mt-1">
            MediBridge is a logistics and procurement platform. It helps organizations locate,
            reserve, and order medical supplies and equipment from verified sources, and track
            those orders to delivery. It does <strong>not</strong> provide clinical advice,
            diagnosis, or treatment recommendations — all clinical decisions remain with qualified
            healthcare professionals.
          </p>
        </EmergencyBanner>

        <div className="mt-10 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Ready to get started?</h2>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className={cn(buttonVariants({ size: 'lg' }))}>Register organization</Link>
            <Link to="/login" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
              Explore the demo
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
