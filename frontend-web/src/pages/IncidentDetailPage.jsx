import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Clock3,
  FileClock,
  LayoutList,
  LockKeyhole,
  RadioTower,
  RefreshCw,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import PageHeader from '../components/common/PageHeader'
import { ErrorState, LoadingState } from '../components/common/States'
import IncidentEvidence from '../components/incidents/IncidentEvidence'
import IncidentOverview from '../components/incidents/IncidentOverview'
import { AuditPanel, SecurityLogsPanel } from '../components/incidents/IncidentRecords'
import IncidentResponse from '../components/incidents/IncidentResponse'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'
import { formatDateTime, formatHours } from '../utils/format'

const emptyResources = () => ({
  analysts: [],
  assets: [],
  threatActors: [],
  incidentTypes: [],
  severities: [],
})

const errorPrefix = (status) => ({
  403: 'Access denied',
  404: 'Record unavailable',
  409: 'Conflict',
  422: 'Validation failed',
}[status] || 'Request failed')

function SummaryMetric({ label, children, detail }) {
  return (
    <div className="min-w-0 border-b border-slate-700/60 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-2 min-h-7 text-sm font-semibold text-slate-100">{children}</div>
      {detail && <p className="mt-1 truncate text-xs text-slate-600">{detail}</p>}
    </div>
  )
}

export default function IncidentDetailPage() {
  const { incidentId: routeIncidentId } = useParams()
  const incidentId = Number(routeIncidentId)
  const validIncidentId = /^[1-9]\d*$/.test(routeIncidentId || '') && Number.isSafeInteger(incidentId)
  const { user } = useAuth()
  const { notify } = useToast()
  const loadedIncidentId = useRef(null)
  const errorIncidentId = useRef(null)
  const mutationInFlight = useRef(false)
  const [incident, setIncident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [securityLogs, setSecurityLogs] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [securityLogsError, setSecurityLogsError] = useState(null)
  const [auditError, setAuditError] = useState(null)
  const [resources, setResources] = useState(emptyResources)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [resourceErrors, setResourceErrors] = useState({})
  const [resourceReload, setResourceReload] = useState(0)
  const [busyKey, setBusyKey] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    setActiveTab('overview')
  }, [incidentId])

  useEffect(() => {
    if (!validIncidentId) {
      setLoading(false)
      return undefined
    }

    let active = true
    const initialLoad = loadedIncidentId.current !== incidentId
    if (initialLoad) {
      setIncident(null)
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)
    errorIncidentId.current = null
    api.incidents.get(incidentId)
      .then((detail) => {
        if (!active) return
        loadedIncidentId.current = incidentId
        setIncident(detail)
      })
      .catch((requestError) => {
        if (!active) return
        loadedIncidentId.current = null
        errorIncidentId.current = incidentId
        setIncident(null)
        setError(requestError)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => { active = false }
  }, [incidentId, reload, user.role, validIncidentId])

  useEffect(() => {
    if (!validIncidentId || user.role === 'REPORTER') {
      setSecurityLogs([])
      setAuditLogs([])
      setSecurityLogsError(null)
      setAuditError(null)
      setRecordsLoading(false)
      return undefined
    }

    let active = true
    setRecordsLoading(true)
    setSecurityLogsError(null)
    setAuditError(null)
    Promise.allSettled([
      api.securityLogs.forIncident(incidentId),
      api.audit.list({ incident_id: incidentId, limit: 200 }),
    ])
      .then(([logsResult, auditResult]) => {
        if (!active) return
        if (logsResult.status === 'fulfilled') setSecurityLogs(logsResult.value)
        else {
          setSecurityLogs([])
          setSecurityLogsError(logsResult.reason)
        }
        if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value)
        else {
          setAuditLogs([])
          setAuditError(auditResult.reason)
        }
      })
      .finally(() => {
        if (active) setRecordsLoading(false)
      })

    return () => { active = false }
  }, [incidentId, reload, user.role, validIncidentId])

  useEffect(() => {
    if (!validIncidentId || user.role === 'REPORTER') {
      setResources(emptyResources())
      setResourceErrors({})
      setResourcesLoading(false)
      return undefined
    }

    let active = true
    setResourcesLoading(true)
    setResourceErrors({})
    const requestMap = user.role === 'ADMIN'
      ? {
          analysts: api.analysts.list(),
          assets: api.assets.list(),
          threatActors: api.threatActors.list(),
          incidentTypes: api.incidentTypes.list(),
          severities: api.severities.list(),
        }
      : {
          assets: api.assets.list(),
          threatActors: api.threatActors.list(),
        }
    const entries = Object.entries(requestMap)

    Promise.allSettled(entries.map(([, request]) => request))
      .then((results) => {
        if (!active) return
        const nextResources = emptyResources()
        const nextErrors = {}
        results.forEach((result, index) => {
          const key = entries[index][0]
          if (result.status === 'fulfilled') nextResources[key] = result.value
          else nextErrors[key] = result.reason
        })
        setResources(nextResources)
        setResourceErrors(nextErrors)
      })
      .finally(() => {
        if (active) setResourcesLoading(false)
      })

    return () => { active = false }
  }, [incidentId, resourceReload, user.role, validIncidentId])

  const runMutation = async (key, operation, successMessage, options = {}) => {
    if (mutationInFlight.current) return false
    mutationInFlight.current = true
    setBusyKey(key)
    try {
      await operation()
      notify(successMessage, 'success')
      setReload((value) => value + 1)
      if (options.refreshResources) setResourceReload((value) => value + 1)
      return true
    } catch (requestError) {
      notify(`${errorPrefix(requestError.status)}: ${requestError.message}`, 'error')
      if ([403, 404, 409].includes(requestError.status)) setReload((value) => value + 1)
      if (options.refreshResources && [404, 409].includes(requestError.status)) {
        setResourceReload((value) => value + 1)
      }
      return false
    } finally {
      mutationInFlight.current = false
      setBusyKey(null)
    }
  }

  const retryRecords = () => setReload((value) => value + 1)
  const retryResources = () => setResourceReload((value) => value + 1)

  if (!validIncidentId) {
    return (
      <>
        <PageHeader eyebrow="Invalid case reference" title="Incident unavailable" description="The incident identifier must be a positive integer." />
        <ErrorState error={{ status: 422, message: 'The incident URL contains an invalid identifier.' }} />
        <Link to="/incidents" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4" />Return to incidents</Link>
      </>
    )
  }

  const hasCurrentError = Boolean(error && errorIncidentId.current === incidentId)
  if ((loading || loadedIncidentId.current !== incidentId) && !hasCurrentError) {
    return <div className="panel"><LoadingState label={`Loading incident #${incidentId}...`} /></div>
  }

  if (hasCurrentError && !incident) {
    const title = error.status === 404 ? 'Incident not found or inaccessible' : error.status === 403 ? 'Incident access denied' : 'Unable to load incident'
    const description = error.status === 404
      ? 'The record does not exist or falls outside your role-scoped incident queue.'
      : 'CIMS could not load the requested case record.'
    return (
      <>
        <PageHeader
          eyebrow={`Incident #${incidentId}`}
          title={title}
          description={description}
          actions={<Link to="/incidents" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-navy-750 px-3.5 py-2 text-sm font-semibold text-slate-200 hover:bg-navy-700"><ArrowLeft className="h-4 w-4" />Incident queue</Link>}
        />
        <ErrorState error={error} onRetry={() => setReload((value) => value + 1)} title={title} />
      </>
    )
  }

  if (!incident) return null

  const sla = incident.sla || {}
  const slaDetail = sla.resolution_breached
    ? 'Resolution target breached'
    : sla.state === 'Completed'
      ? 'Resolution completed'
      : `${formatHours(sla.remaining_resolution_hours)} remaining`
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutList },
    { id: 'response', label: 'Response', icon: ClipboardList, count: incident.actions?.length },
    { id: 'evidence', label: 'Evidence', icon: Boxes, count: (incident.assets?.length || 0) + (incident.threat_actors?.length || 0) },
    { id: 'telemetry', label: 'Telemetry', icon: RadioTower, count: securityLogs.length },
    { id: 'audit', label: 'Audit', icon: FileClock, count: auditLogs.length },
  ]

  return (
    <>
      <PageHeader
        eyebrow={`Incident #${incident.incident_id}`}
        title={incident.title}
        description="Authoritative case data, SLA state, evidence relationships, and permitted response controls."
        actions={(
          <>
            <Link to="/incidents" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-navy-750 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-navy-700">
              <ArrowLeft className="h-4 w-4" /> Queue
            </Link>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => setReload((value) => value + 1)}
              disabled={Boolean(busyKey)}
            >
              Refresh
            </Button>
          </>
        )}
      />

      {user.role === 'REPORTER' && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-blue-500/25 bg-blue-500/[0.05] px-4 py-3 text-xs text-blue-200">
          <LockKeyhole className="h-4 w-4 shrink-0" /> Reporter access: this incident is read-only and operational evidence is redacted.
        </div>
      )}

      <section className="panel mb-5 overflow-hidden" aria-label="Incident summary">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric label="Workflow status" detail={`Reported ${formatDateTime(incident.reported_date)}`}>
            <Badge value={incident.status} kind="status" />
          </SummaryMetric>
          <SummaryMetric label="Severity" detail={`Response ${incident.severity?.response_sla_hours}h / resolution ${incident.severity?.resolution_sla_hours}h`}>
            <Badge value={incident.severity?.level} kind="severity" />
          </SummaryMetric>
          <SummaryMetric label="Incident type" detail={incident.incident_type?.description}>
            <span className="block truncate">{incident.incident_type?.name || 'Unknown'}</span>
          </SummaryMetric>
          <SummaryMetric label="SLA state" detail={slaDetail}>
            <Badge value={sla.state} kind="sla" />
          </SummaryMetric>
        </div>
        <div className="grid gap-px border-t border-slate-700/60 bg-slate-700/50 sm:grid-cols-3">
          <div className="bg-navy-900/70 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Reporter</p><p className="mt-1 truncate text-xs text-slate-300">{incident.reporter?.name} | {incident.reporter?.email}</p></div>
          <div className="bg-navy-900/70 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Response deadline</p><p className="mt-1 text-xs text-slate-300">{formatDateTime(sla.response_deadline)}</p></div>
          <div className="bg-navy-900/70 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Resolution deadline</p><p className="mt-1 text-xs text-slate-300">{formatDateTime(sla.resolution_deadline)}</p></div>
        </div>
      </section>

      <div className="mb-5 overflow-x-auto rounded-xl border border-slate-700/70 bg-navy-850/90 p-1.5" role="tablist" aria-label="Incident detail sections">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${activeTab === id ? 'border-cyan-500/30 bg-cyan-400/10 text-cyan-200' : 'border-transparent text-slate-500 hover:bg-white/[0.035] hover:text-slate-200'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {user.role !== 'REPORTER' && Number.isFinite(count) && (
                <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">{count}</span>
              )}
              {user.role === 'REPORTER' && id !== 'overview' && <LockKeyhole className="h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {activeTab === 'overview' && (
          <IncidentOverview
            incident={incident}
            role={user.role}
            auditLogs={auditLogs}
            auditError={auditError}
            recordsLoading={recordsLoading}
            incidentTypes={resources.incidentTypes}
            severities={resources.severities}
            resourcesLoading={resourcesLoading}
            resourceErrors={resourceErrors}
            busyKey={busyKey}
            onAdvanceStatus={(nextStatus) => runMutation(
              `status:${nextStatus}`,
              () => api.incidents.update(incidentId, { status: nextStatus }),
              `Incident advanced to ${nextStatus}.`,
            )}
            onUpdateIncident={(payload) => runMutation(
              'classification',
              () => api.incidents.update(incidentId, payload),
              'Incident classification and evidence updated.',
            )}
            onRetryRecords={retryRecords}
            onRetryResources={retryResources}
          />
        )}

        {activeTab === 'response' && (
          <IncidentResponse
            incident={incident}
            role={user.role}
            analysts={resources.analysts}
            resourcesLoading={resourcesLoading}
            resourceErrors={resourceErrors}
            busyKey={busyKey}
            onAssign={(payload) => runMutation(
              'assignment',
              () => api.assignments.create(payload),
              incident.status === 'Open' ? 'Analyst assigned; incident advanced to Assigned.' : 'Analyst assignment created.',
              { refreshResources: true },
            )}
            onAddAction={(description) => runMutation(
              'action',
              () => api.actions.create(incidentId, description),
              'Investigation action recorded.',
            )}
            onRetryResources={retryResources}
          />
        )}

        {activeTab === 'evidence' && (
          <IncidentEvidence
            incident={incident}
            role={user.role}
            assets={resources.assets}
            threatActors={resources.threatActors}
            resourcesLoading={resourcesLoading}
            resourceErrors={resourceErrors}
            busyKey={busyKey}
            onLinkAsset={(assetId, impactType) => runMutation(
              'asset-link',
              () => api.assets.link(assetId, incidentId, impactType),
              'Asset associated with the incident.',
              { refreshResources: true },
            )}
            onUnlinkAsset={(assetId) => runMutation(
              `asset-unlink:${assetId}`,
              () => api.assets.unlink(assetId, incidentId),
              'Asset association removed.',
              { refreshResources: true },
            )}
            onLinkActor={(actorId) => runMutation(
              'actor-link',
              () => api.threatActors.link(actorId, incidentId),
              'Threat actor linked to the incident.',
            )}
            onUnlinkActor={(actorId) => runMutation(
              `actor-unlink:${actorId}`,
              () => api.threatActors.unlink(actorId, incidentId),
              'Threat actor association removed.',
            )}
            onRetryResources={retryResources}
          />
        )}

        {activeTab === 'telemetry' && (
          <SecurityLogsPanel
            role={user.role}
            logs={securityLogs}
            loading={recordsLoading}
            error={securityLogsError}
            onRetry={retryRecords}
          />
        )}

        {activeTab === 'audit' && (
          <AuditPanel
            role={user.role}
            records={auditLogs}
            loading={recordsLoading}
            error={auditError}
            onRetry={retryRecords}
          />
        )}
      </div>

      {refreshing && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-navy-800 px-3 py-2 text-xs text-cyan-200 shadow-panel">
          <Clock3 className="h-4 w-4 animate-pulse" /> Synchronizing case record
        </div>
      )}
    </>
  )
}
