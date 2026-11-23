import { useEffect, useState } from 'react'
import { FileClock } from 'lucide-react'

import AuditFilters from '../components/audit/AuditFilters'
import AuditLogTable from '../components/audit/AuditLogTable'
import AuditVerificationPanel from '../components/audit/AuditVerificationPanel'
import PageHeader from '../components/common/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

const initialFilters = { incidentId: '', limit: '200' }

export default function AuditPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const isAdmin = user.role === 'ADMIN'
  const [incidents, setIncidents] = useState([])
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [incidentsError, setIncidentsError] = useState(null)
  const [incidentRevision, setIncidentRevision] = useState(0)
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(isAdmin)
  const [recordsError, setRecordsError] = useState(null)
  const [recordsRevision, setRecordsRevision] = useState(0)
  const [verification, setVerification] = useState(null)
  const [verifying, setVerifying] = useState(false)

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
      setRecords([])
      setRecordsLoading(false)
      setRecordsError(null)
      return undefined
    }

    let active = true
    setRecordsLoading(true)
    setRecordsError(null)
    api.audit.list({
      incident_id: appliedFilters.incidentId ? Number(appliedFilters.incidentId) : undefined,
      limit: Number(appliedFilters.limit),
    })
      .then((data) => {
        if (active) setRecords(data)
      })
      .catch((error) => {
        if (active) setRecordsError(error)
      })
      .finally(() => {
        if (active) setRecordsLoading(false)
      })
    return () => { active = false }
  }, [appliedFilters, isAdmin, recordsRevision])

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
    setAppliedFilters({ ...filters, limit: String(limit) })
  }

  const clearFilters = () => {
    const cleared = { ...initialFilters, incidentId: isAdmin ? '' : filters.incidentId }
    setFilters(cleared)
    setAppliedFilters(cleared)
  }

  const verifyChain = async () => {
    setVerifying(true)
    try {
      const result = await api.audit.verify()
      setVerification(result)
      notify(
        result.integrity_valid ? 'Audit chain verification passed.' : 'Audit chain verification found an integrity failure.',
        result.integrity_valid ? 'success' : 'error',
      )
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tamper-evident history"
        title="Audit Trail"
        description="Review role-scoped incident activity and inspect the complete evidence stored in each chained record."
      />

      {isAdmin && <AuditVerificationPanel result={verification} loading={verifying} onVerify={verifyChain} />}

      {incidentsError && (
        <div className="mb-5">
          <ErrorState error={incidentsError} title="Unable to load accessible incidents" onRetry={() => setIncidentRevision((value) => value + 1)} />
        </div>
      )}

      <section className="panel mb-5">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold text-white">Audit scope</h2>
            <p className="mt-1 text-xs text-slate-500">Administrators may query the full chain; analysts must scope the query to an assigned incident.</p>
          </div>
          <FileClock className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="p-5">
          {incidentsLoading && !incidents.length ? (
            <LoadingState compact label="Loading accessible incidents..." />
          ) : (
            <AuditFilters
              role={user.role}
              incidents={incidents}
              values={filters}
              loading={recordsLoading}
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
            <h2 className="font-semibold text-white">Ordered audit records</h2>
            <p className="mt-1 text-xs text-slate-500">{recordsLoading ? 'Loading chain records...' : `${records.length} record${records.length === 1 ? '' : 's'} returned`}</p>
          </div>
        </div>
        {recordsLoading ? (
          <LoadingState label="Loading audit trail..." />
        ) : recordsError ? (
          <div className="p-5"><ErrorState error={recordsError} title="Audit query failed" onRetry={() => setRecordsRevision((value) => value + 1)} /></div>
        ) : !isAdmin && !incidents.length ? (
          <EmptyState title="No assigned incidents" message="An incident assignment is required before an analyst can review its audit history." />
        ) : records.length === 0 ? (
          <EmptyState title="No audit records found" message="No chained activity exists for the selected scope." />
        ) : (
          <AuditLogTable records={records} incidents={incidents} />
        )}
      </section>
    </div>
  )
}
