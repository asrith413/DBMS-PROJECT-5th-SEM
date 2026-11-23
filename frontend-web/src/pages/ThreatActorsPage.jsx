import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Link2, Plus, Radar, RefreshCw, Search, ShieldAlert } from 'lucide-react'

import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import {
  ThreatActorDetailDialog,
  ThreatActorFormDialog,
  ThreatActorLinkDialog,
} from '../components/threats/ThreatActorDialogs'
import ThreatActorDirectory from '../components/threats/ThreatActorDirectory'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

async function loadAllIncidentSummaries() {
  const incidents = []
  const limit = 200
  for (let offset = 0; ; offset += limit) {
    const page = await api.incidents.list({ offset, limit })
    incidents.push(...page)
    if (page.length < limit) break
  }
  return incidents
}

async function loadDetailsInBatches(incidents) {
  const details = []
  const failures = []
  const batchSize = 12
  for (let index = 0; index < incidents.length; index += batchSize) {
    const batch = incidents.slice(index, index + batchSize)
    const results = await Promise.allSettled(batch.map((incident) => api.incidents.get(incident.incident_id)))
    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') details.push(result.value)
      else failures.push({ incident: batch[resultIndex], error: result.reason })
    })
  }
  return { details, failures }
}

function describeError(action, error) {
  const labels = { 403: 'Permission denied', 404: 'Record unavailable', 409: 'Conflict', 422: 'Validation failed' }
  return `${action}: ${labels[error?.status] || 'Request failed'}. ${error?.message || 'The request could not be completed.'}`
}

function partialMappingError(failures) {
  if (!failures.length) return null
  const first = failures[0].error
  return {
    status: first?.status || null,
    message: `${failures.length} accessible incident detail request${failures.length === 1 ? '' : 's'} failed. Association results are partial. ${first?.message || ''}`.trim(),
  }
}

export default function ThreatActorsPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const isAdmin = user.role === 'ADMIN'
  const requestVersion = useRef(0)
  const [actors, setActors] = useState([])
  const [incidentDetails, setIncidentDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [mappingError, setMappingError] = useState(null)
  const [search, setSearch] = useState('')
  const [formDialog, setFormDialog] = useState({ open: false, actor: null })
  const [selectedActorId, setSelectedActorId] = useState(null)
  const [linkActorId, setLinkActorId] = useState(null)
  const [deleteActorId, setDeleteActorId] = useState(null)
  const [unlinkTarget, setUnlinkTarget] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const hydrateIncidents = useCallback(async (summaries, version) => {
    setMappingLoading(true)
    setMappingError(null)
    try {
      const { details, failures } = await loadDetailsInBatches(summaries)
      if (version !== requestVersion.current) return null
      const issue = partialMappingError(failures)
      setIncidentDetails(details)
      setMappingError(issue)
      return issue
    } finally {
      if (version === requestVersion.current) setMappingLoading(false)
    }
  }, [])

  const loadResources = useCallback(async (showInitialLoader = false) => {
    const version = requestVersion.current + 1
    requestVersion.current = version
    if (showInitialLoader) setLoading(true)
    else setRefreshing(true)
    setError(null)
    setMappingError(null)

    const [actorResult, incidentResult] = await Promise.allSettled([
      api.threatActors.list(),
      loadAllIncidentSummaries(),
    ])

    if (version !== requestVersion.current) return { cancelled: true }
    if (actorResult.status === 'rejected') {
      setError(actorResult.reason)
      setMappingLoading(false)
      setLoading(false)
      setRefreshing(false)
      return { actorError: actorResult.reason }
    }

    setActors(actorResult.value)
    setLoading(false)
    if (incidentResult.status === 'rejected') {
      setIncidentDetails([])
      setMappingError(incidentResult.reason)
      setMappingLoading(false)
      setRefreshing(false)
      return { mappingError: incidentResult.reason }
    }

    const mappingIssue = await hydrateIncidents(incidentResult.value, version)
    if (version === requestVersion.current) setRefreshing(false)
    return { mappingError: mappingIssue }
  }, [hydrateIncidents])

  useEffect(() => {
    loadResources(true)
    return () => { requestVersion.current += 1 }
  }, [loadResources])

  const incidentLinks = useMemo(() => {
    const links = {}
    actors.forEach((actor) => { links[actor.actor_id] = [] })
    incidentDetails.forEach((incident) => {
      const actorLinks = incident.threat_actors || []
      actorLinks.forEach((link) => {
        if (!links[link.actor_id]) links[link.actor_id] = []
        links[link.actor_id].push(incident)
      })
    })
    Object.values(links).forEach((items) => items.sort((left, right) => new Date(right.reported_date) - new Date(left.reported_date)))
    return links
  }, [actors, incidentDetails])

  const actorsById = useMemo(() => new Map(actors.map((actor) => [actor.actor_id, actor])), [actors])
  const selectedActor = actorsById.get(selectedActorId) || null
  const linkActor = actorsById.get(linkActorId) || null
  const deleteActor = actorsById.get(deleteActorId) || null

  const filteredActors = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return actors
    return actors.filter((actor) => [actor.alias, actor.description, actor.actor_id].some((value) => String(value).toLowerCase().includes(query)))
  }, [actors, search])

  const refreshIncidentDetail = async (incidentId) => {
    const detail = await api.incidents.get(incidentId)
    setIncidentDetails((current) => {
      const exists = current.some((incident) => incident.incident_id === incidentId)
      return exists ? current.map((incident) => incident.incident_id === incidentId ? detail : incident) : [...current, detail]
    })
    return detail
  }

  const handleSave = async (payload) => {
    try {
      if (formDialog.actor) {
        const updated = await api.threatActors.update(formDialog.actor.actor_id, payload)
        setError(null)
        setActors((current) => current.map((actor) => actor.actor_id === updated.actor_id ? updated : actor))
        notify(`${updated.alias} was updated.`, 'success')
        return updated
      }
      const created = await api.threatActors.create(payload)
      setError(null)
      setActors((current) => [...current, created].sort((left, right) => left.alias.localeCompare(right.alias)))
      notify(`${created.alias} was added to the threat directory.`, 'success')
      return created
    } catch (requestError) {
      notify(describeError(formDialog.actor ? 'Threat actor update failed' : 'Threat actor creation failed', requestError), 'error')
      throw requestError
    }
  }

  const handleLink = async (actor, incidentId) => {
    try {
      await api.threatActors.link(actor.actor_id, incidentId)
    } catch (requestError) {
      if ([404, 409].includes(requestError.status)) {
        try {
          await refreshIncidentDetail(incidentId)
        } catch {
          // Keep the original association error as the actionable result.
        }
      }
      notify(describeError('Threat actor link failed', requestError), 'error')
      throw requestError
    }
    setIncidentDetails((current) => current.map((incident) => incident.incident_id === incidentId ? {
      ...incident,
      threat_actors: [...(incident.threat_actors || []), { incident_id: incidentId, actor_id: actor.actor_id, threat_actor: actor }],
    } : incident))
    try {
      await refreshIncidentDetail(incidentId)
      notify(`${actor.alias} was linked to incident #${incidentId}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Threat actor was linked, but incident refresh failed', refreshError), 'info')
    }
  }

  const handleUnlink = async () => {
    if (!unlinkTarget) return
    const { actor, incident } = unlinkTarget
    setConfirming(true)
    try {
      await api.threatActors.unlink(actor.actor_id, incident.incident_id)
    } catch (requestError) {
      notify(describeError('Threat actor unlink failed', requestError), 'error')
      setConfirming(false)
      return
    }
    setUnlinkTarget(null)
    setIncidentDetails((current) => current.map((item) => item.incident_id === incident.incident_id ? {
      ...item,
      threat_actors: (item.threat_actors || []).filter((link) => link.actor_id !== actor.actor_id),
    } : item))
    try {
      await refreshIncidentDetail(incident.incident_id)
      notify(`${actor.alias} was unlinked from incident #${incident.incident_id}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Threat actor was unlinked, but incident refresh failed', refreshError), 'info')
    } finally {
      setConfirming(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteActor) return
    setConfirming(true)
    try {
      await api.threatActors.remove(deleteActor.actor_id)
      setError(null)
      setActors((current) => current.filter((actor) => actor.actor_id !== deleteActor.actor_id))
      setDeleteActorId(null)
      if (selectedActorId === deleteActor.actor_id) setSelectedActorId(null)
      notify(`${deleteActor.alias} was deleted.`, 'success')
    } catch (requestError) {
      notify(describeError('Threat actor deletion failed', requestError), 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleRefresh = async () => {
    const result = await loadResources(false)
    if (result?.actorError) notify(describeError('Threat actor refresh failed', result.actorError), 'error')
    else if (result?.mappingError) notify(describeError('Directory refreshed with partial incident coverage', result.mappingError), 'info')
    else if (!result?.cancelled) notify('Threat actor directory and incident-derived associations refreshed.', 'success')
  }

  if (loading) return <LoadingState label="Loading threat actor intelligence..." />

  const totalLinks = Object.values(incidentLinks).reduce((total, items) => total + items.length, 0)
  const activeIncidents = incidentDetails.filter((incident) => !['Resolved', 'Closed'].includes(incident.status)).length

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence / Attribution"
        title="Threat Actor Directory"
        description="Track adversary identities and manage links to active incidents in your accessible operational scope."
        actions={<><Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>Refresh</Button>{isAdmin && <Button icon={Plus} onClick={() => setFormDialog({ open: true, actor: null })}>Register actor</Button>}</>}
      />

      {error && <div className="mb-5"><ErrorState error={error} onRetry={() => loadResources(true)} title="Unable to load threat actors" /></div>}
      {mappingError && actors.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><p className="font-semibold text-amber-100">Incident association coverage is partial</p><p className="mt-1 text-sm text-amber-100/70">{mappingError.message}</p>{mappingError.status && <p className="mt-1 font-mono text-xs text-amber-300/70">HTTP {mappingError.status}</p>}</div></div>
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked actors" value={actors.length} icon={Radar} detail="Global intelligence directory" />
        <StatCard label="Accessible links" value={mappingLoading ? '...' : totalLinks} icon={Link2} tone="blue" detail="Derived from incident details" />
        <StatCard label="Inspected incidents" value={incidentDetails.length} icon={Crosshair} tone="green" detail="Detailed records successfully loaded" />
        <StatCard label="Active link targets" value={activeIncidents} icon={ShieldAlert} tone="yellow" detail="Accessible non-terminal incidents" />
      </section>

      <section className="panel mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input className="field-input pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alias, description, actor ID..." aria-label="Search threat actors" /></div>
          <p className="text-xs text-slate-500">Associations reflect <span className="font-mono text-cyan-300">{incidentDetails.length}</span> accessible incident details</p>
        </div>
      </section>

      {!error && !actors.length ? (
        <div className="panel"><EmptyState title="No threat actors tracked" message={isAdmin ? 'Register the first adversary identity to begin attribution tracking.' : 'No threat actor records are currently available.'} action={isAdmin ? <Button icon={Plus} onClick={() => setFormDialog({ open: true, actor: null })}>Register actor</Button> : undefined} /></div>
      ) : !error && !filteredActors.length ? (
        <div className="panel"><EmptyState title="No matching threat actors" message="Adjust the directory search to see other intelligence records." /></div>
      ) : !error ? (
        <ThreatActorDirectory actors={filteredActors} incidentLinks={incidentLinks} mappingLoading={mappingLoading} isAdmin={isAdmin} onView={(actor) => setSelectedActorId(actor.actor_id)} onEdit={(actor) => setFormDialog({ open: true, actor })} onLink={(actor) => setLinkActorId(actor.actor_id)} onDelete={(actor) => setDeleteActorId(actor.actor_id)} />
      ) : null}

      <ThreatActorFormDialog open={formDialog.open} actor={formDialog.actor} onClose={() => setFormDialog({ open: false, actor: null })} onSave={handleSave} />
      <ThreatActorDetailDialog actor={selectedActor} incidents={selectedActor ? incidentLinks[selectedActor.actor_id] || [] : []} mappingLoading={mappingLoading} mappingError={mappingError} onClose={() => setSelectedActorId(null)} onLink={(actor) => setLinkActorId(actor.actor_id)} onRequestUnlink={(actor, incident) => setUnlinkTarget({ actor, incident })} />
      <ThreatActorLinkDialog actor={linkActor} incidentDetails={incidentDetails} mappingLoading={mappingLoading} mappingError={mappingError} onClose={() => setLinkActorId(null)} onLink={handleLink} />
      <ConfirmDialog open={Boolean(deleteActor)} onClose={() => !confirming && setDeleteActorId(null)} onConfirm={handleDelete} loading={confirming} title="Delete threat actor?" confirmLabel="Delete actor" message={deleteActor ? `Permanently delete ${deleteActor.alias}? The backend will reject deletion if any incident history references this actor.` : ''} />
      <ConfirmDialog open={Boolean(unlinkTarget)} onClose={() => !confirming && setUnlinkTarget(null)} onConfirm={handleUnlink} loading={confirming} title="Remove threat actor link?" confirmLabel="Unlink actor" message={unlinkTarget ? `Remove ${unlinkTarget.actor.alias} from incident #${unlinkTarget.incident.incident_id}? Resolved or closed incidents cannot be modified.` : ''} />
    </div>
  )
}
