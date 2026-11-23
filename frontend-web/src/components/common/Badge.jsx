const severityStyles = {
  Critical: 'border-red-500/40 bg-red-500/10 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  Medium: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  Low: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
}

const statusStyles = {
  Open: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  Assigned: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  'Under Investigation': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  'In Progress': 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  Resolved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Closed: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-200',
}

const slaStyles = {
  Active: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  Completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Breached: 'border-red-500/40 bg-red-500/10 text-red-300',
}

export default function Badge({ value, kind = 'neutral', className = '' }) {
  const style = kind === 'severity'
    ? severityStyles[value]
    : kind === 'status'
      ? statusStyles[value]
      : kind === 'sla'
        ? slaStyles[value]
        : null
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style || 'border-slate-600 bg-slate-700/30 text-slate-300'} ${className}`}>
      {value ?? 'Unknown'}
    </span>
  )
}
