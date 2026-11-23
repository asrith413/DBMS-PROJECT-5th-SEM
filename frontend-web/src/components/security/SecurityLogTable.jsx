import { useState } from 'react'
import { ArrowRight, Braces, Eye, Network } from 'lucide-react'

import Badge from '../common/Badge'
import Modal from '../common/Modal'
import { formatDateTime } from '../../utils/format'

function NetworkPath({ sourceIp, destinationIp }) {
  if (!sourceIp && !destinationIp) return <span className="text-slate-600">Not recorded</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-xs text-slate-400">
      <span>{sourceIp || 'unknown'}</span>
      <ArrowRight className="h-3 w-3 text-slate-600" />
      <span>{destinationIp || 'unknown'}</span>
    </span>
  )
}

function DetailButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-navy-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200"
    >
      <Eye className="h-3.5 w-3.5" /> Details
    </button>
  )
}

export default function SecurityLogTable({ logs, incidents }) {
  const [selected, setSelected] = useState(null)
  const incidentById = new Map(incidents.map((incident) => [Number(incident.incident_id), incident]))

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Incident</th>
              <th>Severity</th>
              <th>Source / event</th>
              <th>Network path</th>
              <th>Description</th>
              <th><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const incident = incidentById.get(Number(log.incident_id))
              return (
                <tr key={log.log_id}>
                  <td className="whitespace-nowrap text-xs tabular-nums text-slate-400">{formatDateTime(log.timestamp)}</td>
                  <td>
                    <p className="font-mono text-xs text-cyan-300">#{log.incident_id}</p>
                    <p className="mt-1 max-w-40 truncate text-xs text-slate-500" title={incident?.title}>{incident?.title || 'Accessible incident'}</p>
                  </td>
                  <td><Badge value={log.severity} kind="severity" /></td>
                  <td>
                    <p className="font-medium text-slate-200">{log.source}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{log.event_type}</p>
                  </td>
                  <td><NetworkPath sourceIp={log.source_ip} destinationIp={log.destination_ip} /></td>
                  <td><p className="max-w-xs line-clamp-2 text-sm leading-5" title={log.description}>{log.description}</p></td>
                  <td className="text-right"><DetailButton onClick={() => setSelected(log)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-800 lg:hidden">
        {logs.map((log) => {
          const incident = incidentById.get(Number(log.incident_id))
          return (
            <article key={log.log_id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-100">{log.source}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{log.event_type}</p>
                </div>
                <Badge value={log.severity} kind="severity" />
              </div>
              <p className="text-sm leading-6 text-slate-300">{log.description}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="uppercase tracking-wider text-slate-600">Incident</p><p className="mt-1 text-cyan-300">#{log.incident_id} {incident?.title}</p></div>
                <div><p className="uppercase tracking-wider text-slate-600">Observed</p><p className="mt-1 text-slate-400">{formatDateTime(log.timestamp)}</p></div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <div className="flex min-w-0 items-center gap-2"><Network className="h-4 w-4 shrink-0 text-slate-600" /><NetworkPath sourceIp={log.source_ip} destinationIp={log.destination_ip} /></div>
                <DetailButton onClick={() => setSelected(log)} />
              </div>
            </article>
          )
        })}
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Security log evidence" description={selected ? `Log ${selected.log_id}` : ''} size="lg">
        {selected && (
          <div className="space-y-5">
            <dl className="grid gap-4 rounded-lg border border-slate-700 bg-navy-900/70 p-4 sm:grid-cols-2">
              {[
                ['Log ID', selected.log_id],
                ['Incident', `#${selected.incident_id}`],
                ['Timestamp', formatDateTime(selected.timestamp)],
                ['UTC timestamp', selected.timestamp],
                ['Source', selected.source],
                ['Event type', selected.event_type],
                ['Severity', selected.severity],
                ['Source IP', selected.source_ip || 'Not recorded'],
                ['Destination IP', selected.destination_ip || 'Not recorded'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="field-label">Description</p>
              <p className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-navy-900/70 p-4 text-sm leading-6 text-slate-300">{selected.description}</p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2"><Braces className="h-4 w-4 text-cyan-400" /><p className="field-label mb-0">Raw metadata</p></div>
              <pre className="max-h-80 overflow-auto rounded-lg border border-slate-700 bg-[#030912] p-4 font-mono text-xs leading-6 text-cyan-100">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
