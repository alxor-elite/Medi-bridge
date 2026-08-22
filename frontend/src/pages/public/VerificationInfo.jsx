import { Link } from 'react-router-dom'
import { ShieldCheck, Clock, ShieldX, Ban, FileCheck2, Building2, Gauge } from 'lucide-react'
import { PublicNavbar } from '../../components/layout/PublicNavbar'
import { Footer } from '../../components/layout/Footer'
import { Card } from '../../components/ui/Card'
import { Reveal } from '../../components/ui/Reveal'
import { Badge } from '../../components/ui/Badge'
import { buttonVariants } from '../../components/ui/Button'
import { cn } from '../../lib/cn'

const CHECKS = [
  { icon: FileCheck2, title: 'License verification', body: 'The registration or trade license is checked against the relevant registry.' },
  { icon: Building2, title: 'Organization details', body: 'Legal name, type, address and primary contact are confirmed.' },
  { icon: Gauge, title: 'Operational readiness', body: 'Ability to maintain live inventory and meet freshness expectations.' },
]

const STATUSES = [
  { badge: 'success', icon: ShieldCheck, label: 'Verified', body: 'Approved and active. Can appear in search and transact on the network.' },
  { badge: 'warning', icon: Clock, label: 'Pending', body: 'Submitted and awaiting administrator review. Cannot transact yet.' },
  { badge: 'danger', icon: ShieldX, label: 'Rejected', body: 'Did not meet verification requirements. May re-apply with corrected details.' },
  { badge: 'neutral', icon: Ban, label: 'Suspended', body: 'Previously verified but paused — e.g. for repeated stale inventory.' },
]

export default function VerificationInfo() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicNavbar />

      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <Reveal>
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
              <ShieldCheck className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Verification & trust
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              In an emergency you can’t afford to wonder whether a supplier is legitimate.
              That’s why every organization is reviewed before it can join the network.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-slate-900">What we check</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {CHECKS.map((c, i) => (
            <Reveal key={c.title} delay={i * 70}>
              <Card className="h-full p-6" hover>
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <c.icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{c.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{c.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">What each status means</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {STATUSES.map((s) => (
              <Card key={s.label} className="flex items-start gap-4 p-5">
                <Badge variant={s.badge} size="md" icon={s.icon}>{s.label}</Badge>
                <p className="flex-1 text-sm text-slate-600">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-slate-900">Get your organization verified</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Registration takes a few minutes. Approval is typically completed within a day.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/register" className={cn(buttonVariants({ size: 'lg' }))}>Register organization</Link>
          <Link to="/about" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>How it works</Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
