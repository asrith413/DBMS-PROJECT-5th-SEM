import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import Badge from '../common/Badge'
import Button from '../common/Button'
import { EmptyState, ErrorState, LoadingState } from '../common/States'
import { formatDateTime, formatHours } from '../../utils/format'

const allFiltersEmpty = (filters) => (
  !filters.status
  && !filters.severityId
  && !filters.typeId
  && !filters.search.trim()
)

function SlaSummary({ incident }) {
  const { sla } = incident
  const terminal = incident.status === 'Resolved' || incident.status === 'Closed'
  let detail = `${formatHours(sla?.remaining_resolution_hours)} left`
  if (sla?.resolution_breached) detail = 'Resolution breached'
  else if (terminal) detail = 'Resolution complete'

  return (
    <div className="space-y-1.5">
      <Badge value={sla?.state} kind="sla" />
      <p className="whitespace-nowrap text-xs text-slate-500">{detail}</p>
    </div>
  )
}

export function IncidentFilters({
  filters,
  onChange,
  onClear,
  statuses,
  severities,
  incidentTypes,
  referencesLoading,
  referencesError,
  onRetryReferences,
  searchPending,
}) {
  const activeCount = [
    filters.status,
    filters.severityId,
    filters.typeId,
    filters.search.trim(),
  ].filter(Boolean).length

  return (
    <section className="panel mb-5" aria-labelledby="incident-filters-title">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
          <h2 id="incident-filters-title" className="text-sm font-semibold text-slate-200">Queue filters</h2>
          {activeCount > 0 && (
            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-300">
              {activeCount} active
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          icon={FilterX}
          onClick={onClear}
          disabled={allFiltersEmpty(filters)}
          className="min-h-9 py-1.5"
        >
          Clear
        </Button>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.6fr]">
        <label className="block">
          <span className="field-label">Status</span>
          <select
            className="field-input"
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Severity</span>
          <select
            className="field-input"
            value={filters.severityId}
            onChange={(event) => onChange('severityId', event.target.value)}
            disabled={referencesLoading && severities.length === 0}
          >
            <option value="">All severities</option>
            {severities.map((severity) => (
              <option key={severity.severity_id} value={severity.severity_id}>{severity.level}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Incident type</span>
          <select
            className="field-input"
            value={filters.typeId}
            onChange={(event) => onChange('typeId', event.target.value)}
            disabled={referencesLoading && incidentTypes.length === 0}
          >
            <option value="">All types</option>
            {incidentTypes.map((type) => (
              <option key={type.type_id} value={type.type_id}>{type.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Search evidence</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              className="field-input pl-10 pr-20"
              value={filters.search}
              onChange={(event) => onChange('search', event.target.value)}
              maxLength={200}
              placeholder="Title or description"
              type="search"
            />
            {searchPending && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Updating
              </span>
            )}
          </span>
        </label>
      </div>

      {referencesError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-200/80">
          <span>Some filter reference data is unavailable: {referencesError.message}</span>
          <button type="button" onClick={onRetryReferences} className="font-semibold text-amber-300 hover:text-amber-200">
            Retry reference data
          </button>
        </div>
      )}
    </section>
  )
}

function MobileIncidentCard({ incident }) {
  return (
    <Link
      to={`/incidents/${incident.incident_id}`}
      className="block border-b border-slate-800 p-4 transition last:border-b-0 hover:bg-cyan-400/[0.035]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold text-cyan-400">INC-{incident.incident_id}</p>
          <h3 className="mt-1 line-clamp-2 font-semibold text-slate-100">{incident.title}</h3>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge value={incident.severity?.level} kind="severity" />
        <Badge value={incident.status} kind="status" />
        <Badge value={incident.sla?.state} kind="sla" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-600">Type</p>
          <p className="mt-1 truncate text-slate-300">{incident.incident_type?.name || 'Unknown'}</p>
        </div>
        <div>
          <p className="text-slate-600">Reported</p>
          <p className="mt-1 text-slate-300">{formatDateTime(incident.reported_date)}</p>
        </div>
      </div>
    </Link>
  )
}

export function IncidentQueue({
  incidents,
  loading,
  error,
  onRetry,
  emptyAction,
  offset,
  pageSize,
  hasMore,
  onPrevious,
  onNext,
}) {
  if (loading) return <div className="panel"><LoadingState label="Loading role-scoped incident queue..." /></div>
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Unable to load incident queue" />

  if (incidents.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="No incidents found"
          message={offset > 0 ? 'This result page is empty. Return to the previous page to continue.' : 'No accessible incidents match the current queue filters.'}
          action={offset > 0 ? <Button variant="secondary" icon={ChevronLeft} onClick={onPrevious}>Previous page</Button> : emptyAction}
        />
      </div>
    )
  }

  return (
    <section aria-labelledby="incident-queue-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="incident-queue-title" className="text-base font-semibold text-slate-100">Incident queue</h2>
          <p className="mt-1 text-xs text-slate-500">
            Showing records {offset + 1}-{offset + incidents.length} in your authorized scope
          </p>
        </div>
        <p className="text-xs text-slate-600">Newest reports first</p>
      </div>

      <div className="table-shell">
        <div className="divide-y divide-slate-800 md:hidden">
          {incidents.map((incident) => <MobileIncidentCard key={incident.incident_id} incident={incident} />)}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Classification</th>
                <th>Severity</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Reported</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.incident_id}>
                  <td className="max-w-md">
                    <Link to={`/incidents/${incident.incident_id}`} className="group block">
                      <span className="font-mono text-[11px] font-semibold text-cyan-500">INC-{incident.incident_id}</span>
                      <span className="mt-1 block font-semibold text-slate-100 transition group-hover:text-cyan-200">
                        {incident.title}
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-slate-400">{incident.incident_type?.name || 'Unknown'}</td>
                  <td><Badge value={incident.severity?.level} kind="severity" /></td>
                  <td><Badge value={incident.status} kind="status" /></td>
                  <td><SlaSummary incident={incident} /></td>
                  <td className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(incident.reported_date)}</td>
                  <td>
                    <Link
                      to={`/incidents/${incident.incident_id}`}
                      className="inline-flex rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-300"
                      aria-label={`Open incident ${incident.incident_id}`}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" icon={ChevronLeft} onClick={onPrevious} disabled={offset === 0}>
          Previous
        </Button>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Page {Math.floor(offset / pageSize) + 1}
        </span>
        <Button variant="secondary" onClick={onNext} disabled={!hasMore}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}
