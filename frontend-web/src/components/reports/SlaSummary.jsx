import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react'

export default function SlaSummary({ total, breaches }) {
  const totalCount = Number(total) || 0
  const breachCount = Number(breaches) || 0
  const withoutRecordedBreach = Math.max(0, totalCount - breachCount)
  const noBreachShare = totalCount ? (withoutRecordedBreach / totalCount) * 100 : 0
  const progressWidth = Math.min(100, Math.max(0, noBreachShare))

  return (
    <section className="panel my-5 overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">Service levels</p>
          <h2 className="mt-1 font-semibold text-white">SLA view from available aggregates</h2>
        </div>
        <Gauge className="h-5 w-5 text-slate-500" />
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_.75fr]">
        <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4">
              <div className="flex items-center gap-2 text-red-300"><AlertTriangle className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-wider">Breached</p></div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white">{breachCount}</p>
              <p className="mt-1 text-xs text-slate-500">API-reported SLA breaches</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
              <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-wider">No breach recorded</p></div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white">{withoutRecordedBreach}</p>
              <p className="mt-1 text-xs text-slate-500">Total minus reported breaches</p>
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">All-record share</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white">{noBreachShare.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-slate-500">Without a recorded breach</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-red-500/20" aria-label={`${noBreachShare.toFixed(1)} percent of all incidents have no recorded SLA breach`}>
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progressWidth}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/60 p-4 text-sm leading-6 text-slate-400">
          <p className="font-semibold text-slate-200">Compliance context</p>
          <p className="mt-2">
            The dashboard API provides total incidents and breach count, but does not separate active non-breached cases from completed-on-time cases. The percentage shown is therefore an all-incident no-breach share, not a completed-case SLA compliance rate.
          </p>
        </div>
      </div>
    </section>
  )
}
