import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import Badge from '../common/Badge'
import { EmptyState } from '../common/States'
import { formatDateTime } from '../../utils/format'

function incidentReference(id) {
  const value = String(id ?? '')
  return value ? `INC-${value.padStart(4, '0')}` : 'Incident'
}

export default function RecentIncidentsTable({ incidents, total, scopeLabel }) {
  const shown = incidents.length

  return (
    <section className="table-shell w-full min-w-0" aria-labelledby="recent-incidents-title">
      <header className="panel-header">
        <div>
          <h2 id="recent-incidents-title" className="text-base font-semibold text-white">Recent incident queue</h2>
          <p className="mt-1 text-xs text-slate-500">Latest records in {scopeLabel}.</p>
        </div>
        {shown > 0 && (
          <p className="rounded-full border border-slate-700 bg-navy-900 px-3 py-1 text-xs tabular-nums text-slate-400">
            {total > shown ? `${shown} of ${total.toLocaleString()}` : `${shown} record${shown === 1 ? '' : 's'}`}
          </p>
        )}
      </header>

      {shown === 0 ? (
        <EmptyState
          title="No incidents in this scope"
          message="Incident records available to this account will appear here."
        />
      ) : (
        <div className="overflow-x-auto w-full min-w-0">
          <table className="data-table min-w-[760px]">
            <caption className="sr-only">Most recently reported incidents accessible to this account</caption>
            <thead>
              <tr>
                <th scope="col">Incident</th>
                <th scope="col">Severity</th>
                <th scope="col">Status</th>
                <th scope="col" className="hidden lg:table-cell">Type</th>
                <th scope="col" className="hidden xl:table-cell">Reporter</th>
                <th scope="col" className="hidden md:table-cell">SLA</th>
                <th scope="col">Reported</th>
                <th scope="col"><span className="sr-only">Open incident</span></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const id = incident.incident_id
                const href = `/incidents/${encodeURIComponent(id)}`
                const slaState = incident.sla?.state || (incident.sla?.sla_breached ? 'Breached' : null)

                return (
                  <tr key={id}>
                    <td className="max-w-[22rem]">
                      <Link to={href} className="group block min-w-0">
                        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-500/80">
                          {incidentReference(id)}
                        </span>
                        <span className="mt-1 block truncate font-semibold text-slate-200 transition group-hover:text-cyan-300">
                          {incident.title}
                        </span>
                      </Link>
                    </td>
                    <td><Badge value={incident.severity?.level} kind="severity" /></td>
                    <td><Badge value={incident.status} kind="status" /></td>
                    <td className="hidden max-w-[13rem] truncate text-slate-400 lg:table-cell">{incident.incident_type?.name || '-'}</td>
                    <td className="hidden max-w-[12rem] truncate text-slate-400 xl:table-cell">{incident.reporter?.name || '-'}</td>
                    <td className="hidden md:table-cell">
                      {slaState ? <Badge value={slaState} kind="sla" /> : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-slate-400">
                      <time dateTime={incident.reported_date || undefined}>{formatDateTime(incident.reported_date)}</time>
                    </td>
                    <td className="text-right">
                      <Link
                        to={href}
                        className="inline-grid h-8 w-8 place-items-center rounded-lg border border-transparent text-slate-500 transition hover:border-cyan-500/30 hover:bg-cyan-400/10 hover:text-cyan-300"
                        aria-label={`Open ${incident.title}`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
