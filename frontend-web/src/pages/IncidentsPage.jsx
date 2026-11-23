import { useDeferredValue, useEffect, useState } from 'react'
import { Plus, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import Button from '../components/common/Button'
import PageHeader from '../components/common/PageHeader'
import CreateIncidentModal from '../components/incidents/CreateIncidentModal'
import { IncidentFilters, IncidentQueue } from '../components/incidents/IncidentQueue'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { INCIDENT_STATUSES } from '../utils/constants'

const PAGE_SIZE = 20
const emptyFilters = { status: '', severityId: '', typeId: '', search: '' }

const scopeDescription = {
  ADMIN: 'Monitor every reported incident and coordinate the SOC response lifecycle.',
  ANALYST: 'Work the incident queue currently assigned to your analyst profile.',
  REPORTER: 'Track incidents submitted by your account and report new security events.',
}

export default function IncidentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canCreate = user.role === 'ADMIN' || user.role === 'REPORTER'
  const [filters, setFilters] = useState(emptyFilters)
  const deferredSearch = useDeferredValue(filters.search)
  const [offset, setOffset] = useState(0)
  const [incidents, setIncidents] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [incidentTypes, setIncidentTypes] = useState([])
  const [severities, setSeverities] = useState([])
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [referencesError, setReferencesError] = useState(null)
  const [referenceReload, setReferenceReload] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let active = true
    setReferencesLoading(true)
    setReferencesError(null)
    Promise.allSettled([api.incidentTypes.list(), api.severities.list()])
      .then(([typesResult, severitiesResult]) => {
        if (!active) return
        if (typesResult.status === 'fulfilled') setIncidentTypes(typesResult.value)
        if (severitiesResult.status === 'fulfilled') setSeverities(severitiesResult.value)
        const failed = [typesResult, severitiesResult].find((result) => result.status === 'rejected')
        if (failed) setReferencesError(failed.reason)
      })
      .finally(() => {
        if (active) setReferencesLoading(false)
      })
    return () => { active = false }
  }, [referenceReload])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    api.incidents.list({
      status: filters.status || undefined,
      severity_id: filters.severityId ? Number(filters.severityId) : undefined,
      type_id: filters.typeId ? Number(filters.typeId) : undefined,
      search: deferredSearch.trim() || undefined,
      offset,
      limit: PAGE_SIZE + 1,
    })
      .then((records) => {
        if (!active) return
        setHasMore(records.length > PAGE_SIZE)
        setIncidents(records.slice(0, PAGE_SIZE))
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError)
        setIncidents([])
        setHasMore(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [filters.status, filters.severityId, filters.typeId, deferredSearch, offset, reload, user.role])

  const updateFilter = (field, value) => {
    setOffset(0)
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const clearFilters = () => {
    setOffset(0)
    setFilters(emptyFilters)
  }

  const hasActiveFilters = Object.values(filters).some((value) => value.trim())
  const emptyAction = hasActiveFilters ? (
    <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
  ) : canCreate ? (
    <Button icon={Plus} onClick={() => setCreateOpen(true)}>Report incident</Button>
  ) : null

  return (
    <>
      <PageHeader
        eyebrow="Case operations"
        title="Incident management"
        description={scopeDescription[user.role]}
        actions={canCreate && (
          <Button icon={ShieldAlert} onClick={() => setCreateOpen(true)}>Report incident</Button>
        )}
      />

      <IncidentFilters
        filters={filters}
        onChange={updateFilter}
        onClear={clearFilters}
        statuses={INCIDENT_STATUSES}
        severities={severities}
        incidentTypes={incidentTypes}
        referencesLoading={referencesLoading}
        referencesError={referencesError}
        onRetryReferences={() => setReferenceReload((value) => value + 1)}
        searchPending={filters.search !== deferredSearch}
      />

      <IncidentQueue
        incidents={incidents}
        loading={loading}
        error={error}
        onRetry={() => setReload((value) => value + 1)}
        emptyAction={emptyAction}
        offset={offset}
        pageSize={PAGE_SIZE}
        hasMore={hasMore}
        onPrevious={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
        onNext={() => setOffset((value) => value + PAGE_SIZE)}
      />

      {canCreate && (
        <CreateIncidentModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(incident) => {
            setCreateOpen(false)
            navigate(`/incidents/${incident.incident_id}`)
          }}
        />
      )}
    </>
  )
}
