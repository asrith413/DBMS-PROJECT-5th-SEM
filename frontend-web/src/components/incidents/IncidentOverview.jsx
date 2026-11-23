import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileClock,
  LockKeyhole,
  Mail,
  PencilLine,
  Save,
  ShieldCheck,
  UserRound,
  Workflow,
} from 'lucide-react'

import Badge from '../common/Badge'
import Button from '../common/Button'
import ConfirmDialog from '../common/ConfirmDialog'
import FormField from '../common/FormField'
import { formatDateTime, formatHours } from '../../utils/format'
import { INCIDENT_STATUSES, NEXT_STATUS, TERMINAL_STATUSES } from '../../utils/constants'

const auditLabels = {
  INCIDENT_CREATED: 'Incident created',
  INCIDENT_ASSIGNED: 'Analyst assigned',
  STATUS_CHANGED: 'Status advanced',
  INCIDENT_RESOLVED: 'Incident resolved',
  INCIDENT_UPDATED: 'Incident updated',
  SEVERITY_CHANGED: 'Severity changed',
  ACTION_ADDED: 'Investigation action added',
  ASSET_ASSOCIATED: 'Asset associated',
  ASSET_REMOVED: 'Asset association removed',
  THREAT_ACTOR_ASSOCIATED: 'Threat actor linked',
  THREAT_ACTOR_REMOVED: 'Threat actor unlinked',
}

function auditDescription(record) {
  const data = record.action_data || {}
  switch (record.action_type) {
    case 'INCIDENT_CREATED':
      return data.title || 'The case record entered the incident queue.'
    case 'INCIDENT_ASSIGNED':
      return `${data.analyst_name || `Analyst #${data.analyst_id || 'unknown'}`} assigned as ${data.role || 'analyst'}.`
    case 'STATUS_CHANGED':
    case 'INCIDENT_RESOLVED':
      return `${data.old_status || 'Previous state'} to ${data.new_status || 'new state'}`
    case 'ACTION_ADDED':
      return data.description || 'An investigation action was recorded.'
    case 'ASSET_ASSOCIATED':
      return `${data.asset_name || `Asset #${data.asset_id || 'unknown'}`} - ${data.impact_type || 'impact recorded'}`
    case 'ASSET_REMOVED':
      return `Asset #${data.asset_id || 'unknown'} was removed from the active case.`
    case 'THREAT_ACTOR_ASSOCIATED':
      return data.alias || `Threat actor #${data.actor_id || 'unknown'}`
    case 'THREAT_ACTOR_REMOVED':
      return `Threat actor #${data.actor_id || 'unknown'} was unlinked.`
    case 'SEVERITY_CHANGED':
      return `Severity reference changed from #${data.old_severity_id || 'unknown'} to #${data.new_severity_id || 'unknown'}.`
    case 'INCIDENT_UPDATED':
      return `Updated fields: ${Object.keys(data).join(', ') || 'incident evidence'}`
    default:
      return 'An audited case event was recorded.'
  }
}

function SectionHeading({ icon: Icon, title, description, action }) {
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
      {action}
    </div>
  )
}

function SlaOverview({ incident }) {
  const sla = incident.sla || {}
  const severity = incident.severity || {}
  const resolutionText = sla.resolution_breached
    ? 'Resolution target breached'
    : sla.state === 'Completed'
      ? 'Resolution completed'
      : `${formatHours(sla.remaining_resolution_hours)} remaining`

  return (
    <section className="panel">
      <SectionHeading
        icon={CalendarClock}
        title="SLA control"
        description="Deadlines are calculated from the severity values captured by the case."
        action={<Badge value={sla.state} kind="sla" />}
      />
      <div className="grid gap-px bg-slate-700/50 sm:grid-cols-2">
        <div className="bg-navy-850 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Response deadline</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">{formatDateTime(sla.response_deadline)}</p>
          <div className={`mt-3 flex items-center gap-2 text-xs ${sla.response_breached ? 'text-red-300' : 'text-emerald-300'}`}>
            {sla.response_breached ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {sla.response_breached ? 'Response target breached' : `Within ${severity.response_sla_hours || '-'}h response target`}
          </div>
        </div>
        <div className="bg-navy-850 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Resolution deadline</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">{formatDateTime(sla.resolution_deadline)}</p>
          <div className={`mt-3 flex items-center gap-2 text-xs ${sla.resolution_breached ? 'text-red-300' : 'text-cyan-300'}`}>
            {sla.resolution_breached ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
            {resolutionText}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-700/60 px-5 py-3 text-xs text-slate-500">
        Severity policy: {severity.level || 'Unknown'} | response {severity.response_sla_hours || '-'}h | resolution {severity.resolution_sla_hours || '-'}h
      </div>
    </section>
  )
}

function StatusWorkflow({ incident, role, busyKey, onAdvanceStatus }) {
  const [pendingStatus, setPendingStatus] = useState(null)
  const currentIndex = INCIDENT_STATUSES.indexOf(incident.status)
  const nextStatus = NEXT_STATUS[incident.status]
  const canOperate = role === 'ADMIN' || role === 'ANALYST'

  const confirmAdvance = async () => {
    const succeeded = await onAdvanceStatus(pendingStatus)
    if (succeeded) setPendingStatus(null)
  }
  const statusMutationActive = busyKey === `status:${pendingStatus}`

  return (
    <section className="panel">
      <SectionHeading
        icon={Workflow}
        title="Ordered workflow"
        description="CIMS permits only the next lifecycle state; previous states cannot be restored."
        action={<Badge value={incident.status} kind="status" />}
      />
      <div className="overflow-x-auto px-5 py-5">
        <ol className="flex min-w-[680px] items-start">
          {INCIDENT_STATUSES.map((status, index) => {
            const reached = currentIndex >= index
            const current = status === incident.status
            return (
              <li key={status} className="relative flex flex-1 flex-col items-center text-center last:flex-none last:w-20">
                {index < INCIDENT_STATUSES.length - 1 && (
                  <span className={`absolute left-1/2 top-2.5 h-px w-full ${currentIndex > index ? 'bg-cyan-400/70' : 'bg-slate-700'}`} />
                )}
                <span className={`relative z-[1] grid h-5 w-5 place-items-center rounded-full border ${current ? 'border-cyan-300 bg-cyan-400 text-navy-950 shadow-[0_0_14px_rgba(34,211,238,0.45)]' : reached ? 'border-cyan-500 bg-cyan-400/20 text-cyan-300' : 'border-slate-700 bg-navy-900 text-slate-700'}`}>
                  {reached && !current ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-2.5 w-2.5" />}
                </span>
                <span className={`mt-2 max-w-24 text-[10px] font-semibold leading-4 ${current ? 'text-cyan-200' : reached ? 'text-slate-300' : 'text-slate-600'}`}>
                  {status}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-700/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {!canOperate ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole className="h-4 w-4" /> Submitted incidents are read-only for reporters.
          </div>
        ) : incident.status === 'Open' ? (
          <p className="text-xs leading-5 text-amber-200/80">
            No direct status action is available. An administrator must create an analyst assignment, which advances the incident to Assigned.
          </p>
        ) : nextStatus ? (
          <>
            <p className="text-xs text-slate-500">Next permitted state: <span className="font-semibold text-slate-300">{nextStatus}</span></p>
            <Button
              onClick={() => setPendingStatus(nextStatus)}
              loading={busyKey === `status:${nextStatus}`}
              disabled={Boolean(busyKey)}
            >
              Advance to {nextStatus}
            </Button>
          </>
        ) : (
          <p className="text-xs text-slate-500">Closed is the final workflow state. No further transition is available.</p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        onClose={() => { if (!statusMutationActive) setPendingStatus(null) }}
        onConfirm={confirmAdvance}
        title={`Advance to ${pendingStatus || ''}?`}
        message={`This ordered transition cannot be reversed in CIMS. Incident #${incident.incident_id} will move from ${incident.status} to ${pendingStatus || 'the next state'}.`}
        confirmLabel="Advance status"
        loading={statusMutationActive}
      />
    </section>
  )
}

function IncidentTimeline({ incident, role, auditLogs, auditError, auditLoading, onRetryRecords }) {
  const auditedEvents = [...auditLogs].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
  const fallbackEvents = [
    {
      log_id: 'reported',
      action_type: 'INCIDENT_CREATED',
      timestamp: incident.reported_date,
      performer: incident.reporter,
      action_data: { title: incident.title },
    },
    ...(incident.resolved_date ? [{
      log_id: 'resolved',
      action_type: 'INCIDENT_RESOLVED',
      timestamp: incident.resolved_date,
      performer: null,
      action_data: { new_status: 'Resolved' },
    }] : []),
  ]
  const events = auditedEvents.length > 0 ? auditedEvents : fallbackEvents

  return (
    <section className="panel">
      <SectionHeading
        icon={FileClock}
        title="Case timeline"
        description={role === 'REPORTER' ? 'Reporter-visible lifecycle milestones.' : 'Chronological events from the incident audit trail.'}
      />
      {auditError && role !== 'REPORTER' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.04] px-5 py-3 text-xs text-amber-200/80">
          <span>Audit events could not be loaded; showing basic lifecycle dates.</span>
          <button type="button" onClick={onRetryRecords} className="font-semibold text-amber-300 hover:text-amber-200">Retry</button>
        </div>
      )}
      {auditLoading && role !== 'REPORTER' ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
          Loading audited timeline...
        </div>
      ) : <ol className="max-h-[520px] overflow-y-auto px-5 py-2">
        {events.map((event, index) => (
          <li key={event.log_id} className="relative flex gap-4 pb-5 pt-3 last:pb-3">
            {index < events.length - 1 && <span className="absolute left-[7px] top-7 h-[calc(100%-0.5rem)] w-px bg-slate-700" />}
            <span className="relative mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border border-cyan-400/60 bg-navy-850 shadow-[0_0_0_4px_rgba(34,211,238,0.05)]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-200">{auditLabels[event.action_type] || event.action_type.replaceAll('_', ' ')}</p>
                <time className="whitespace-nowrap text-[11px] text-slate-600">{formatDateTime(event.timestamp)}</time>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{auditDescription(event)}</p>
              <p className="mt-1 text-[11px] text-slate-600">{event.performer?.name || 'CIMS workflow'}</p>
            </div>
          </li>
        ))}
      </ol>}
    </section>
  )
}

function ClassificationEditor({
  incident,
  incidentTypes,
  severities,
  referencesLoading,
  referencesError,
  onRetryResources,
  busyKey,
  onUpdateIncident,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', typeId: '', severityId: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    setForm({
      title: incident.title,
      description: incident.description,
      typeId: String(incident.incident_type?.type_id || ''),
      severityId: String(incident.severity?.severity_id || ''),
    })
    setErrors({})
    setMessage('')
  }, [incident.incident_id, incident.title, incident.description, incident.incident_type?.type_id, incident.severity?.severity_id])

  const change = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const title = form.title.trim()
    const description = form.description.trim()
    const nextErrors = {}
    if (title.length < 3) nextErrors.title = 'Enter at least 3 characters.'
    if (description.length < 10) nextErrors.description = 'Enter at least 10 characters.'
    if (!form.typeId) nextErrors.typeId = 'Select an incident type.'
    if (!form.severityId) nextErrors.severityId = 'Select a severity.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = {}
    if (title !== incident.title) payload.title = title
    if (description !== incident.description) payload.description = description
    if (Number(form.typeId) !== incident.incident_type?.type_id) payload.type_id = Number(form.typeId)
    if (Number(form.severityId) !== incident.severity?.severity_id) payload.severity_id = Number(form.severityId)
    if (Object.keys(payload).length === 0) {
      setMessage('No incident fields changed.')
      return
    }
    const succeeded = await onUpdateIncident(payload)
    if (succeeded) setEditing(false)
  }

  if (!editing) {
    return (
      <section className="panel">
        <SectionHeading
          icon={PencilLine}
          title="Administrative classification"
          description="Only administrators can revise active incident evidence and classification."
          action={<Button variant="secondary" icon={PencilLine} onClick={() => setEditing(true)}>Edit case</Button>}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="field-label">Type</p><p className="text-sm text-slate-200">{incident.incident_type?.name}</p></div>
          <div><p className="field-label">Severity</p><Badge value={incident.severity?.level} kind="severity" /></div>
          <div><p className="field-label">Response SLA</p><p className="text-sm text-slate-200">{incident.severity?.response_sla_hours}h</p></div>
          <div><p className="field-label">Resolution SLA</p><p className="text-sm text-slate-200">{incident.severity?.resolution_sla_hours}h</p></div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <SectionHeading
        icon={PencilLine}
        title="Edit classification and evidence"
        description="Changes are validated and appended to the audit chain."
      />
      {referencesError ? (
        <div className="p-5">
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-200">
            <p>Reference data could not be loaded: {referencesError.message}</p>
            <button type="button" onClick={onRetryResources} className="mt-2 text-xs font-semibold text-red-300 hover:text-red-200">Retry reference data</button>
          </div>
        </div>
      ) : (
        <form className="space-y-4 p-5" onSubmit={submit} noValidate>
          <FormField label="Title" required error={errors.title}>
            <input className="field-input" value={form.title} maxLength={200} onChange={(event) => change('title', event.target.value)} />
          </FormField>
          <FormField label="Description" required error={errors.description}>
            <textarea className="field-input min-h-32 resize-y" value={form.description} maxLength={10000} onChange={(event) => change('description', event.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Incident type" required error={errors.typeId}>
              <select className="field-input" value={form.typeId} onChange={(event) => change('typeId', event.target.value)} disabled={referencesLoading}>
                <option value="">Select type</option>
                {incidentTypes.map((type) => <option key={type.type_id} value={type.type_id}>{type.name}</option>)}
              </select>
            </FormField>
            <FormField label="Severity" required error={errors.severityId}>
              <select className="field-input" value={form.severityId} onChange={(event) => change('severityId', event.target.value)} disabled={referencesLoading}>
                <option value="">Select severity</option>
                {severities.map((severity) => (
                  <option key={severity.severity_id} value={severity.severity_id}>
                    {severity.level} | {severity.response_sla_hours}h / {severity.resolution_sla_hours}h
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {message && <p className="text-xs text-cyan-300">{message}</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-700/60 pt-4">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busyKey === 'classification'}>Cancel</Button>
            <Button type="submit" icon={Save} loading={busyKey === 'classification'} disabled={Boolean(busyKey) && busyKey !== 'classification'}>
              Save changes
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

export default function IncidentOverview({
  incident,
  role,
  auditLogs,
  auditError,
  recordsLoading,
  incidentTypes,
  severities,
  resourcesLoading,
  resourceErrors,
  busyKey,
  onAdvanceStatus,
  onUpdateIncident,
  onRetryRecords,
  onRetryResources,
}) {
  const active = !TERMINAL_STATUSES.has(incident.status)
  const classificationError = resourceErrors.incidentTypes || resourceErrors.severities

  return (
    <div className="space-y-5">
      {role === 'REPORTER' && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.05] p-4">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <p className="text-sm font-semibold text-blue-100">Reporter view is read-only</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">SOC assignments, assets, threat intelligence, response actions, telemetry, and audit evidence are redacted by the API.</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <section className="panel">
          <SectionHeading icon={ShieldCheck} title="Incident narrative" description="Authoritative evidence submitted with this case." />
          <div className="p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{incident.description}</p>
          </div>
        </section>

        <section className="panel">
          <SectionHeading icon={UserRound} title="Reporter" description="Originating account for this case." />
          <div className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-100">{incident.reporter?.name || 'Unknown reporter'}</p>
              <p className="mt-1 text-xs font-semibold text-cyan-400">{incident.reporter?.role}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="h-4 w-4 text-slate-600" />
              <span className="truncate">{incident.reporter?.email || 'No email available'}</span>
            </div>
            <div className="border-t border-slate-700/60 pt-4">
              <p className="field-label">Reported</p>
              <p className="text-xs text-slate-300">{formatDateTime(incident.reported_date)}</p>
              <p className="field-label mt-4">Resolved</p>
              <p className="text-xs text-slate-300">{formatDateTime(incident.resolved_date)}</p>
            </div>
          </div>
        </section>
      </div>

      <SlaOverview incident={incident} />
      <StatusWorkflow incident={incident} role={role} busyKey={busyKey} onAdvanceStatus={onAdvanceStatus} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <IncidentTimeline
          incident={incident}
          role={role}
          auditLogs={auditLogs}
          auditError={auditError}
          auditLoading={recordsLoading}
          onRetryRecords={onRetryRecords}
        />
        <section className="panel">
          <SectionHeading icon={Clock3} title="Case timestamps" description="Core dates and current SLA health." />
          <dl className="divide-y divide-slate-700/60 px-5">
            <div className="flex items-center justify-between gap-4 py-4"><dt className="text-xs text-slate-500">Reported</dt><dd className="text-right text-xs text-slate-200">{formatDateTime(incident.reported_date)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-4"><dt className="text-xs text-slate-500">Response deadline</dt><dd className="text-right text-xs text-slate-200">{formatDateTime(incident.sla?.response_deadline)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-4"><dt className="text-xs text-slate-500">Resolution deadline</dt><dd className="text-right text-xs text-slate-200">{formatDateTime(incident.sla?.resolution_deadline)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-4"><dt className="text-xs text-slate-500">Resolved</dt><dd className="text-right text-xs text-slate-200">{formatDateTime(incident.resolved_date)}</dd></div>
          </dl>
        </section>
      </div>

      {role === 'ADMIN' && active && (
        <ClassificationEditor
          incident={incident}
          incidentTypes={incidentTypes}
          severities={severities}
          referencesLoading={resourcesLoading}
          referencesError={classificationError}
          onRetryResources={onRetryResources}
          busyKey={busyKey}
          onUpdateIncident={onUpdateIncident}
        />
      )}
      {role === 'ADMIN' && !active && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-navy-850/80 px-5 py-4 text-xs text-slate-500">
          <LockKeyhole className="h-4 w-4" /> Classification and evidence are read-only after resolution.
        </div>
      )}
    </div>
  )
}
