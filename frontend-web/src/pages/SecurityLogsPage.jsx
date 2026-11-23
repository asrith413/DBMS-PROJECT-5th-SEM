import { useEffect, useState } from 'react'
import { Plus, RadioTower } from 'lucide-react'

import Button from '../components/common/Button'
import PageHeader from '../components/common/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import CreateSecurityLogModal from '../components/security/CreateSecurityLogModal'
import SecurityLogFilters from '../components/security/SecurityLogFilters'
import SecurityLogTable from '../components/security/SecurityLogTable'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

const initialFilters = {
  incidentId: '',
  source: '',
  severity: '',
  eventType: '',
  search: '',
  limit: '200',
}

export default function SecurityLogsPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const isAdmin = user.role === 'ADMIN'
  const [incidents, setIncidents] = useState([])
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [incidentsError, setIncidentsError] = useState(null)
  const [incidentRevision, setIncidentRevision] = useState(0)
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(isAdmin)
  const [logsError, setLogsError] = useState(null)
  const [logsRevision, setLogsRevision] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let active = true
    setIncidentsLoading(true)
    setIncidentsError(null)
    api.incidents.list({ limit: 200 })
      .then((data) => {
        if (!active) return
        setIncidents(data)
        if (!isAdmin) {
          const availableIds = new Set(data.map((incident) => String(incident.incident_id)))
          setFilters((current) => ({
            ...current,
            incidentId: availableIds.has(current.incidentId) ? current.incidentId : String(data[0]?.incident_id || ''),
          }))
          setAppliedFilters((current) => ({
            ...current,
            incidentId: availableIds.has(current.incidentId) ? current.incidentId : String(data[0]?.incident_id || ''),
          }))
        }
      })
      .catch((error) => {
        if (active) setIncidentsError(error)
      })
      .finally(() => {
        if (active) setIncidentsLoading(false)
      })
    return () => { active = false }
  }, [incidentRevision, isAdmin])

  useEffect(() => {
    if (!isAdmin && !appliedFilters.incidentId) {
      setLogs([])
      setLogsLoading(false)
      setLogsError(null)
      return undefined
    }

    let active = true
    setLogsLoading(true)
    setLogsError(null)
    api.securityLogs.list({
      incident_id: appliedFilters.incidentId ? Number(appliedFilters.incidentId) : undefined,
      source: appliedFilters.source || undefined,
      severity: appliedFilters.severity || undefined,
      event_type: appliedFilters.eventType || undefined,
      search: appliedFilters.search || undefined,
      limit: Number(appliedFilters.limit),
    })
      .then((data) => {
        if (active) setLogs(data)
      })
      .catch((error) => {
        if (active) setLogsError(error)
      })
      .finally(() => {
        if (active) setLogsLoading(false)
      })
    return () => { active = false }
  }, [appliedFilters, isAdmin, logsRevision])

  const activeIncidents = incidents.filter((incident) => !['Resolved', 'Closed'].includes(incident.status))

  const applyFilters = () => {
    const limit = Number(filters.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      notify('Result limit must be a whole number from 1 to 1000.', 'error')
      return
    }
    if (!isAdmin && !filters.incidentId) {
      notify('Analysts must select an assigned incident.', 'error')
      return
    }
    setAppliedFilters({
      ...filters,
      source: filters.source.trim(),
      eventType: filters.eventType.trim(),
      search: filters.search.trim(),
      limit: String(limit),
    })
  }

  const clearFilters = () => {
    const cleared = {
      ...initialFilters,
      incidentId: isAdmin ? '' : filters.incidentId,
    }
    setFilters(cleared)
    setAppliedFilters(cleared)
  }

  const createLog = async (payload) => {
    try {
      await api.securityLogs.create(payload)
      notify('Security log added to the incident.', 'success')
      setCreateOpen(false)
      setLogsRevision((value) => value + 1)
    } catch (error) {
      notify(error.message, 'error')
      throw error
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="MongoDB telemetry"
        title="Security Logs"
        description="Query real incident telemetry through the API and attach evidence to active investigations."
        actions={(
          <Button
            icon={Plus}
            onClick={() => setCreateOpen(true)}
            disabled={activeIncidents.length === 0 || incidentsLoading || Boolean(incidentsError)}
            title={activeIncidents.length ? 'Add security log' : 'An accessible active incident is required'}
          >
            Add log
          </Button>
        )}
      />

      {incidentsError && (
        <div className="mb-5">
          <ErrorState error={incidentsError} title="Unable to load accessible incidents" onRetry={() => setIncidentRevision((value) => value + 1)} />
        </div>
      )}

      <section className="panel mb-5">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold text-white">Telemetry query</h2>
            <p className="mt-1 text-xs text-slate-500">Filters map directly to the security log API.</p>
          </div>
          <RadioTower className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="p-5">
          {incidentsLoading && !incidents.length ? (
            <LoadingState compact label="Loading accessible incidents..." />
          ) : (
            <SecurityLogFilters
              role={user.role}
              incidents={incidents}
              values={filters}
              loading={logsLoading}
              onChange={setFilters}
              onApply={applyFilters}
              onClear={clearFilters}
            />
          )}
        </div>
      </section>

      <section className="table-shell">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold text-white">Telemetry records</h2>
            <p className="mt-1 text-xs text-slate-500">{logsLoading ? 'Running query...' : `${logs.length} record${logs.length === 1 ? '' : 's'} returned`}</p>
          </div>
        </div>
        {logsLoading ? (
          <LoadingState label="Querying security logs..." />
        ) : logsError ? (
          <div className="p-5"><ErrorState error={logsError} title="Security log query failed" onRetry={() => setLogsRevision((value) => value + 1)} /></div>
        ) : !isAdmin && !incidents.length ? (
          <EmptyState title="No assigned incidents" message="Analysts can query telemetry only for incidents assigned to them." />
        ) : logs.length === 0 ? (
          <EmptyState title="No telemetry matched" message="Adjust the incident or log filters and run the query again." />
        ) : (
          <SecurityLogTable logs={logs} incidents={incidents} />
        )}
      </section>

      <CreateSecurityLogModal open={createOpen} onClose={() => setCreateOpen(false)} incidents={activeIncidents} onCreate={createLog} />
    </div>
  )
}
