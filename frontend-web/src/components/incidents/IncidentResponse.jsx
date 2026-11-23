import { useEffect, useState } from 'react'
import {
  ClipboardList,
  LockKeyhole,
  MessageSquarePlus,
  Plus,
  UserCheck,
  UserPlus,
} from 'lucide-react'

import Button from '../common/Button'
import FormField from '../common/FormField'
import { ErrorState, LoadingState } from '../common/States'
import { formatDateTime } from '../../utils/format'
import { TERMINAL_STATUSES } from '../../utils/constants'

function SectionHeading({ icon: Icon, title, description, detail }) {
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
      {detail && <span className="rounded-full border border-slate-700 bg-navy-900 px-2.5 py-1 text-xs font-semibold text-slate-400">{detail}</span>}
    </div>
  )
}

function RestrictedResponse() {
  return (
    <div className="panel flex min-h-72 items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[0.06] text-blue-300">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-100">SOC response details are redacted</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Analyst assignments and investigation actions are restricted to authorized SOC personnel. Your submitted incident remains available in the Overview tab.
        </p>
      </div>
    </div>
  )
}

function Assignments({
  incident,
  analysts,
  analystsLoading,
  analystsError,
  busyKey,
  onAssign,
  onRetryResources,
}) {
  const assignments = incident.assignments || []
  const active = !TERMINAL_STATUSES.has(incident.status)
  const assignedIds = new Set(assignments.map((assignment) => assignment.analyst_id))
  const available = analysts.filter((analyst) => !assignedIds.has(analyst.user_id))
  const [analystId, setAnalystId] = useState('')
  const [assignmentRole, setAssignmentRole] = useState('Primary Analyst')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (analystId && !available.some((analyst) => String(analyst.user_id) === String(analystId))) {
      setAnalystId('')
    }
  }, [analystId, available])

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!analystId) nextErrors.analystId = 'Select an analyst.'
    if (assignmentRole.trim().length < 2) nextErrors.assignmentRole = 'Enter at least 2 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const succeeded = await onAssign({
      incident_id: incident.incident_id,
      analyst_id: Number(analystId),
      role: assignmentRole.trim(),
    })
    if (succeeded) {
      setAnalystId('')
      setAssignmentRole('Primary Analyst')
    }
  }

  return (
    <section className="panel">
      <SectionHeading
        icon={UserCheck}
        title="Analyst assignments"
        description="Assignment records are permanent case history; the API does not support unassignment."
        detail={`${assignments.length} assigned`}
      />
      {assignments.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <UserPlus className="mx-auto h-6 w-6 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-300">No analyst assigned</p>
          <p className="mt-1 text-xs text-slate-600">An administrator assignment is required to move an Open incident to Assigned.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {assignments.map((assignment) => (
            <div key={assignment.assignment_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-xs font-bold text-cyan-300">
                  {(assignment.analyst_name || 'A').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-200">{assignment.analyst_name || `Analyst #${assignment.analyst_id}`}</p>
                  <p className="mt-0.5 text-xs text-cyan-400">{assignment.role}</p>
                </div>
              </div>
              <div className="text-xs text-slate-500 sm:text-right">
                <p className="font-mono text-[10px] text-slate-600">ASSIGN-{assignment.assignment_id}</p>
                <p className="mt-1">{formatDateTime(assignment.assigned_date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="border-t border-slate-700/60 bg-navy-900/35 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Create assignment</h3>
          {analystsLoading && analysts.length === 0 ? (
            <LoadingState label="Loading analysts..." compact />
          ) : analystsError ? (
            <ErrorState error={analystsError} onRetry={onRetryResources} title="Unable to load analysts" />
          ) : available.length === 0 ? (
            <p className="text-xs leading-5 text-slate-500">Every provisioned analyst is already assigned to this incident.</p>
          ) : (
            <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_0.7fr_auto] lg:items-end" noValidate>
              <FormField label="Analyst" required error={errors.analystId}>
                <select
                  className="field-input"
                  value={analystId}
                  onChange={(event) => { setAnalystId(event.target.value); setErrors((current) => ({ ...current, analystId: undefined })) }}
                >
                  <option value="">Select analyst</option>
                  {available.map((analyst) => (
                    <option key={analyst.user_id} value={analyst.user_id}>
                      {analyst.user?.name} | workload {analyst.workload} | {analyst.expertise}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Assignment role" required error={errors.assignmentRole}>
                <input
                  className="field-input"
                  value={assignmentRole}
                  onChange={(event) => { setAssignmentRole(event.target.value); setErrors((current) => ({ ...current, assignmentRole: undefined })) }}
                  maxLength={100}
                />
              </FormField>
              <Button
                type="submit"
                icon={Plus}
                loading={busyKey === 'assignment'}
                disabled={Boolean(busyKey) && busyKey !== 'assignment'}
                className="w-full lg:w-auto"
              >
                Assign
              </Button>
            </form>
          )}
        </div>
      )}
      {!active && (
        <div className="border-t border-slate-700/60 px-5 py-3 text-xs text-slate-500">Assignments are read-only after resolution.</div>
      )}
    </section>
  )
}

function Actions({ incident, busyKey, onAddAction }) {
  const actions = incident.actions || []
  const active = !TERMINAL_STATUSES.has(incident.status)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const value = description.trim()
    if (value.length < 3) {
      setError('Enter at least 3 characters.')
      return
    }
    const succeeded = await onAddAction(value)
    if (succeeded) {
      setDescription('')
      setError('')
    }
  }

  return (
    <section className="panel">
      <SectionHeading
        icon={ClipboardList}
        title="Investigation actions"
        description="Chronological response and containment work recorded by SOC personnel."
        detail={`${actions.length} actions`}
      />
      {actions.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <ClipboardList className="mx-auto h-6 w-6 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-300">No investigation actions recorded</p>
          <p className="mt-1 text-xs text-slate-600">Add the first concrete investigative or containment action below.</p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-800">
          {actions.map((action) => (
            <li key={action.action_id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <p className="text-xs font-semibold text-slate-300">{action.performer?.name || `User #${action.performed_by}`}</p>
                  <span className="text-[10px] font-semibold text-slate-600">{action.performer?.role}</span>
                </div>
                <time className="text-[11px] text-slate-600">{formatDateTime(action.action_date)}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{action.description}</p>
            </li>
          ))}
        </ol>
      )}

      {active ? (
        <form onSubmit={submit} className="border-t border-slate-700/60 bg-navy-900/35 p-5" noValidate>
          <FormField label="New investigation action" required error={error} hint={`${description.length}/4000 characters`}>
            <textarea
              className="field-input min-h-24 resize-y"
              value={description}
              onChange={(event) => { setDescription(event.target.value); setError('') }}
              maxLength={4000}
              placeholder="Record a concrete investigative or containment action"
            />
          </FormField>
          <div className="mt-3 flex justify-end">
            <Button
              type="submit"
              icon={MessageSquarePlus}
              loading={busyKey === 'action'}
              disabled={Boolean(busyKey) && busyKey !== 'action'}
            >
              Add action
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-t border-slate-700/60 px-5 py-3 text-xs text-slate-500">Actions are read-only after resolution.</div>
      )}
    </section>
  )
}

export default function IncidentResponse({
  incident,
  role,
  analysts,
  resourcesLoading,
  resourceErrors,
  busyKey,
  onAssign,
  onAddAction,
  onRetryResources,
}) {
  if (role === 'REPORTER') return <RestrictedResponse />

  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      {role === 'ADMIN' ? (
        <Assignments
          incident={incident}
          analysts={analysts}
          analystsLoading={resourcesLoading}
          analystsError={resourceErrors.analysts}
          busyKey={busyKey}
          onAssign={onAssign}
          onRetryResources={onRetryResources}
        />
      ) : (
        <section className="panel">
          <SectionHeading
            icon={UserCheck}
            title="Analyst assignments"
            description="Assignment context for this incident. Only administrators can create assignments."
            detail={`${(incident.assignments || []).length} assigned`}
          />
          <div className="divide-y divide-slate-800">
            {(incident.assignments || []).map((assignment) => (
              <div key={assignment.assignment_id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div><p className="text-sm font-semibold text-slate-200">{assignment.analyst_name || `Analyst #${assignment.analyst_id}`}</p><p className="mt-1 text-xs text-cyan-400">{assignment.role}</p></div>
                <p className="text-right text-xs text-slate-500">{formatDateTime(assignment.assigned_date)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <Actions incident={incident} busyKey={busyKey} onAddAction={onAddAction} />
    </div>
  )
}
