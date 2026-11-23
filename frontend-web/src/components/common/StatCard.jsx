export default function StatCard({ label, value, icon: Icon, tone = 'cyan', detail }) {
  const tones = {
    cyan: 'border-cyan-500/20 text-cyan-300',
    blue: 'border-blue-500/20 text-blue-300',
    red: 'border-red-500/25 text-red-300',
    green: 'border-emerald-500/25 text-emerald-300',
    yellow: 'border-yellow-500/25 text-yellow-200',
  }
  return (
    <article className={`panel border-l-2 p-4 ${tones[tone] || tones.cyan}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        {Icon && <div className="rounded-lg bg-current/10 p-2"><Icon className="h-5 w-5" /></div>}
      </div>
    </article>
  )
}
