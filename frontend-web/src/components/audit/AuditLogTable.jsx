import { useState } from 'react'
import { Braces, Eye, Link2 } from 'lucide-react'

import Modal from '../common/Modal'
import { formatDateTime, shortHash } from '../../utils/format'

function DetailButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-navy-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200"
    >
      <Eye className="h-3.5 w-3.5" /> Evidence
    </button>
  )
}

function ActionLabel({ value }) {
  return <span className="inline-flex rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-1 font-mono text-xs text-blue-200">{value}</span>
}

export default function AuditLogTable({ records, incidents }) {
  const [selected, setSelected] = useState(null)
  const incidentById = new Map(incidents.map((incident) => [Number(incident.incident_id), incident]))

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>Log</th>
              <th>Time</th>
              <th>Incident</th>
              <th>Performer</th>
              <th>Action</th>
              <th>Hash</th>
              <th><span className="sr-only">Evidence</span></th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const incident = incidentById.get(Number(record.incident_id))
              return (
                <tr key={record.log_id}>
                  <td className="font-mono text-xs text-slate-500">#{record.log_id}</td>
                  <td className="whitespace-nowrap text-xs tabular-nums text-slate-400">{formatDateTime(record.timestamp)}</td>
                  <td>
                    <p className="font-mono text-xs text-cyan-300">#{record.incident_id}</p>
                    <p className="mt-1 max-w-40 truncate text-xs text-slate-500" title={incident?.title}>{incident?.title || 'Accessible incident'}</p>
                  </td>
                  <td>
                    <p className="font-medium text-slate-200">{record.performer?.name || `User #${record.performed_by}`}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.performer?.role || record.performer?.email}</p>
                  </td>
                  <td><ActionLabel value={record.action_type} /></td>
                  <td><code className="text-xs text-slate-500" title={record.hash}>{shortHash(record.hash, 16)}</code></td>
                  <td className="text-right"><DetailButton onClick={() => setSelected(record)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-800 lg:hidden">
        {records.map((record) => {
          const incident = incidentById.get(Number(record.incident_id))
          return (
            <article key={record.log_id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-600">LOG #{record.log_id}</p>
                  <div className="mt-2"><ActionLabel value={record.action_type} /></div>
                </div>
                <p className="text-right text-xs tabular-nums text-slate-500">{formatDateTime(record.timestamp)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="uppercase tracking-wider text-slate-600">Performer</p><p className="mt-1 text-slate-200">{record.performer?.name || `User #${record.performed_by}`}</p></div>
                <div><p className="uppercase tracking-wider text-slate-600">Incident</p><p className="mt-1 text-cyan-300">#{record.incident_id} {incident?.title}</p></div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <code className="min-w-0 truncate text-xs text-slate-600">{shortHash(record.hash, 20)}</code>
                <DetailButton onClick={() => setSelected(record)} />
              </div>
            </article>
          )
        })}
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Audit record evidence" description={selected ? `Log #${selected.log_id} / ${selected.action_type}` : ''} size="lg">
        {selected && (
          <div className="space-y-5">
            <dl className="grid gap-4 rounded-lg border border-slate-700 bg-navy-900/70 p-4 sm:grid-cols-2">
              {[
                ['Incident', `#${selected.incident_id}`],
                ['Performed by', `${selected.performer?.name || `User #${selected.performed_by}`} (${selected.performer?.email || 'email unavailable'})`],
                ['Action', selected.action_type],
                ['Timestamp', formatDateTime(selected.timestamp)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="mb-2 flex items-center gap-2"><Braces className="h-4 w-4 text-cyan-400" /><p className="field-label mb-0">Action data</p></div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-slate-700 bg-[#030912] p-4 font-mono text-xs leading-6 text-cyan-100">{JSON.stringify(selected.action_data ?? {}, null, 2)}</pre>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2"><Link2 className="h-4 w-4 text-cyan-400" /><p className="field-label mb-0">Complete chain hashes</p></div>
              <dl className="space-y-3 rounded-lg border border-slate-700 bg-navy-900/70 p-4">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Previous hash</dt>
                  <dd className="mt-1 break-all font-mono text-xs leading-5 text-slate-400">{selected.prev_hash}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Record hash</dt>
                  <dd className="mt-1 break-all font-mono text-xs leading-5 text-cyan-200">{selected.hash}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
