import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'

import Button from './Button'

export function LoadingState({ label = 'Loading secure data…', compact = false }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-slate-400 ${compact ? 'py-6' : 'min-h-[280px]'}`} role="status">
      <LoaderCircle className="h-5 w-5 animate-spin text-cyan-400" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ title = 'No records found', message, action }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 rounded-xl border border-slate-700 bg-navy-800 p-3 text-slate-500">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-slate-200">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Unable to load data' }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-red-200">{title}</h3>
          <p className="mt-1 break-words text-sm text-red-300/80">{error?.message || String(error || 'Unknown API error')}</p>
          {error?.status && <p className="mt-2 text-xs text-red-400/70">HTTP {error.status}</p>}
        </div>
        {onRetry && <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>Retry</Button>}
      </div>
    </div>
  )
}
