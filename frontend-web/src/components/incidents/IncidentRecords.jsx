import {
  Braces,
  FileKey2,
  Hash,
  LockKeyhole,
  Network,
  RadioTower,
  ScrollText,
} from 'lucide-react'

import Badge from '../common/Badge'
import { EmptyState, ErrorState, LoadingState } from '../common/States'
import { formatDateTime, shortHash } from '../../utils/format'

const humanizeAction = (value) => String(value || 'AUDIT_EVENT')
  .toLowerCase()
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

function SectionHeading({ icon: Icon, title, description, detail }) {
  return (
    <div className="panel-header">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-cyan-500/20 bg-cyan-400/[0.06] p-2 text-cyan-300">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {detail && <span className="rounded-full border border-slate-700 bg-navy-900 px-2.5 py-1 text-xs font-semibold text-slate-400">{detail}</span>}
    </div>
  )
}

function RestrictedRecords({ kind }) {
  return (
    <div className="panel flex min-h-72 items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[0.06] text-blue-300">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-100">{kind} is restricted</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This evidence is available only to authorized administrators and assigned analysts. Reporter responses are redacted by the API.
        </p>
      </div>
    </div>
  )
}

export function SecurityLogsPanel({ role, logs, loading, error, onRetry }) {
  if (role === 'REPORTER') return <RestrictedRecords kind="Security telemetry" />

  return (
    <section className="panel">
      <SectionHeading
        icon={RadioTower}
        title="Linked security telemetry"
        description="MongoDB security events scoped to this incident by the API."
        detail={!loading ? `${logs.length} events` : undefined}
      />
      {loading ? (
        <LoadingState label="Loading linked security logs..." />
      ) : error ? (
        <div className="p-5"><ErrorState error={error} onRetry={onRetry} title="Unable to load security logs" /></div>
      ) : logs.length === 0 ? (
        <EmptyState title="No linked security logs" message="No MongoDB telemetry currently references this incident." />
      ) : (
        <div className="divide-y divide-slate-800">
          {logs.map((record) => {
            const hasMetadata = record.metadata && Object.keys(record.metadata).length > 0
            return (
              <article key={record.log_id} className="px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={record.severity} kind="severity" />
                      <span className="text-sm font-semibold text-slate-200">{record.event_type}</span>
                      <span className="rounded border border-slate-700 bg-navy-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{record.source}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{record.description}</p>
                  </div>
                  <div className="shrink-0 text-left lg:text-right">
                    <p className="font-mono text-[10px] text-slate-600">LOG-{record.log_id}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(record.timestamp)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-800 pt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-2"><Network className="h-3.5 w-3.5 text-slate-600" />Source <code className="text-slate-300">{record.source_ip || 'not recorded'}</code></span>
                  <span className="flex items-center gap-2"><Network className="h-3.5 w-3.5 rotate-180 text-slate-600" />Destination <code className="text-slate-300">{record.destination_ip || 'not recorded'}</code></span>
                </div>
                {hasMetadata && (
                  <details className="mt-3 rounded-lg border border-slate-700/60 bg-navy-900/50 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-400">
                      <Braces className="h-4 w-4" /> Event metadata
                    </summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all border-t border-slate-700/60 pt-3 font-mono text-[11px] leading-5 text-slate-500">{JSON.stringify(record.metadata, null, 2)}</pre>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function AuditPanel({ role, records, loading, error, onRetry }) {
  if (role === 'REPORTER') return <RestrictedRecords kind="Audit history" />

  return (
    <section className="panel">
      <SectionHeading
        icon={ScrollText}
        title="Tamper-evident audit history"
        description="Newest-first incident events from the chained PostgreSQL audit records."
        detail={!loading ? `${records.length} records` : undefined}
      />
      {loading ? (
        <LoadingState label="Loading incident audit history..." />
      ) : error ? (
        <div className="p-5"><ErrorState error={error} onRetry={onRetry} title="Unable to load audit history" /></div>
      ) : records.length === 0 ? (
        <EmptyState title="No audit records found" message="No accessible audit history was returned for this incident." />
      ) : (
        <ol className="divide-y divide-slate-800">
          {records.map((record) => (
            <li key={record.log_id} className="px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold text-cyan-500">AUD-{record.log_id}</span>
                    <h3 className="text-sm font-semibold text-slate-200">{humanizeAction(record.action_type)}</h3>
                    <code className="rounded border border-slate-700 bg-navy-900 px-2 py-0.5 text-[10px] text-slate-500">{record.action_type}</code>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{record.performer?.name || `User #${record.performed_by}`}</span>
                    <span className="text-slate-600">{record.performer?.role}</span>
                    <time>{formatDateTime(record.timestamp)}</time>
                  </div>
                </div>
                <div className="grid shrink-0 gap-1 font-mono text-[10px] text-slate-600">
                  <span className="flex items-center gap-2" title={record.hash}><Hash className="h-3 w-3" />{shortHash(record.hash, 18)}</span>
                  <span className="flex items-center gap-2" title={record.prev_hash}><FileKey2 className="h-3 w-3" />{shortHash(record.prev_hash, 18)}</span>
                </div>
              </div>
              <details className="mt-3 rounded-lg border border-slate-700/60 bg-navy-900/50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-400">Audited action data</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all border-t border-slate-700/60 pt-3 font-mono text-[11px] leading-5 text-slate-500">{JSON.stringify(record.action_data, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
