import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Link2, ShieldPlus, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import Badge from '../common/Badge'
import Button from '../common/Button'
import FormField from '../common/FormField'
import Modal from '../common/Modal'
import { formatDateTime } from '../../utils/format'

const fieldError = (error, field) => error?.fields?.find((item) => item.field.split('.').at(-1) === field)?.message

function ApiFormError({ error, title = 'Request failed' }) {
  if (!error) return null
  return (
    <div className="mb-4 flex gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-200" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div>
        <p className="font-semibold">{title}{error.status ? ` | HTTP ${error.status}` : ''}</p>
        <p className="mt-1 text-red-300/80">{error.message || 'The request could not be completed.'}</p>
      </div>
    </div>
  )
}

export function AnalystDetailDialog({ analyst, onClose, onAssign }) {
  if (!analyst) return null

  return (
    <Modal
      open={Boolean(analyst)}
      onClose={onClose}
      title={analyst.user.name}
      description="Profile, current workload, and incident assignment history"
      size="xl"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-navy-900/70 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Profile workload</p>
          <p className="mt-2 font-mono text-2xl font-bold text-white">{analyst.workload}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/70 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Active assignments</p>
          <p className="mt-2 font-mono text-2xl font-bold text-cyan-300">{analyst.activeAssignments.length}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/70 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Assignment history</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-100">{analyst.assignmentRecords.length}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</p>
          <p className="mt-2 font-medium text-slate-200">{analyst.user.email}</p>
          <p className="mt-1 text-sm text-slate-500">{analyst.department || 'No department recorded'}</p>
        </div>
        <div className="rounded-lg border border-slate-700/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expertise</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{analyst.expertise}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Assigned incidents</h3>
          <p className="mt-1 text-xs text-slate-500">Derived from assignment and incident records, newest assignment first.</p>
        </div>
        <Button variant="secondary" icon={ShieldPlus} onClick={() => onAssign(analyst)}>New assignment</Button>
      </div>

      {analyst.assignmentRecords.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-700/70">
          <table className="data-table min-w-[680px]">
            <thead><tr><th>Incident</th><th>Status</th><th>Assignment role</th><th>Assigned</th></tr></thead>
            <tbody>
              {analyst.assignmentRecords.map(({ assignment, incident }) => (
                <tr key={assignment.assignment_id}>
                  <td>
                    {incident ? (
                      <Link to={`/incidents/${incident.incident_id}`} onClick={onClose} className="font-semibold text-cyan-300 hover:text-cyan-200">
                        <span className="mr-2 font-mono text-xs text-slate-500">#{incident.incident_id}</span>{incident.title}
                      </Link>
                    ) : <span className="text-slate-500">Incident #{assignment.incident_id} unavailable</span>}
                  </td>
                  <td>{incident ? <Badge kind="status" value={incident.status} /> : '-'}</td>
                  <td className="text-slate-300">{assignment.role}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(assignment.assigned_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
          No assignment history for this analyst.
        </div>
      )}
    </Modal>
  )
}

export function ExpertiseDialog({ analyst, onClose, onSave }) {
  const [expertise, setExpertise] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!analyst) return
    setExpertise(analyst.expertise)
    setError(null)
  }, [analyst])

  if (!analyst) return null

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(analyst, expertise.trim())
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={Boolean(analyst)} onClose={() => !saving && onClose()} title="Update expertise" description={`Change the capability summary for ${analyst.user.name}.`} size="sm">
      <form onSubmit={submit}>
        <ApiFormError error={error} />
        <FormField label="Expertise" required error={fieldError(error, 'expertise')} hint="2-255 characters; describe the analyst's strongest response domains.">
          <textarea className="field-input min-h-28 resize-y" value={expertise} onChange={(event) => setExpertise(event.target.value)} minLength={2} maxLength={255} required autoFocus />
        </FormField>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={expertise.trim().length < 2}>Save expertise</Button>
        </div>
      </form>
    </Modal>
  )
}

export function AssignmentDialog({ open, analysts, incidents, assignments, initialAnalyst, onClose, onAssign }) {
  const [analystId, setAnalystId] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [role, setRole] = useState('Primary Analyst')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setAnalystId(initialAnalyst ? String(initialAnalyst.user_id) : '')
    setIncidentId('')
    setRole('Primary Analyst')
    setError(null)
  }, [open, initialAnalyst])

  const assignedKeys = new Set(assignments.map((item) => `${item.analyst_id}:${item.incident_id}`))
  const activeIncidents = incidents.filter((incident) => !['Resolved', 'Closed'].includes(incident.status))
  const availableIncidents = analystId
    ? activeIncidents.filter((incident) => !assignedKeys.has(`${analystId}:${incident.incident_id}`))
    : []

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onAssign({ analyst_id: Number(analystId), incident_id: Number(incidentId), role: role.trim() })
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Assign incident" description="Assignments are created only for active incidents and immediately update analyst workload.">
      <form onSubmit={submit}>
        <ApiFormError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Analyst" required error={fieldError(error, 'analyst_id')}>
            <select className="field-input" value={analystId} onChange={(event) => { setAnalystId(event.target.value); setIncidentId('') }} required autoFocus>
              <option value="">Select analyst</option>
              {analysts.map((analyst) => <option key={analyst.user_id} value={analyst.user_id}>{analyst.user.name} | {analyst.activeAssignments.length} active</option>)}
            </select>
          </FormField>
          <FormField label="Assignment role" required error={fieldError(error, 'role')}>
            <input className="field-input" value={role} onChange={(event) => setRole(event.target.value)} minLength={2} maxLength={100} required />
          </FormField>
        </div>
        <FormField label="Active incident" required className="mt-4" error={fieldError(error, 'incident_id')} hint={analystId && !availableIncidents.length ? 'This analyst is already assigned to every active incident.' : 'Resolved and closed incidents are intentionally excluded.'}>
          <select className="field-input" value={incidentId} onChange={(event) => setIncidentId(event.target.value)} required disabled={!analystId || !availableIncidents.length}>
            <option value="">{analystId ? 'Select incident' : 'Select an analyst first'}</option>
            {availableIncidents.map((incident) => <option key={incident.incident_id} value={incident.incident_id}>#{incident.incident_id} | {incident.title} | {incident.status}</option>)}
          </select>
        </FormField>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" icon={ShieldPlus} loading={saving} disabled={!analystId || !incidentId || role.trim().length < 2}>Create assignment</Button>
        </div>
      </form>
    </Modal>
  )
}

const blankAccount = { name: '', email: '', password: '', department: '', expertise: '' }

export function ProvisionAnalystDialog({ open, eligibleUsers, resumeAccount, onClose, onProvision, onAttach }) {
  const [mode, setMode] = useState('new')
  const [account, setAccount] = useState(blankAccount)
  const [existingUserId, setExistingUserId] = useState('')
  const [existingExpertise, setExistingExpertise] = useState('')
  const [partial, setPartial] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPartial(null)
    if (resumeAccount) {
      setMode('existing')
      setExistingUserId(String(resumeAccount.user.user_id))
      setExistingExpertise(resumeAccount.expertise || '')
    } else {
      setMode('new')
      setAccount(blankAccount)
      setExistingUserId('')
      setExistingExpertise('')
    }
  }, [open, resumeAccount])

  const updateAccount = (field) => (event) => setAccount((current) => ({ ...current, [field]: event.target.value }))

  const submitNew = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const result = await onProvision({
        name: account.name.trim(),
        email: account.email.trim(),
        password: account.password,
        department: account.department.trim() || null,
        expertise: account.expertise.trim(),
      })
      if (result?.partial) {
        setPartial(result)
        setMode('partial')
      } else {
        onClose()
      }
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  const submitExisting = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onAttach({ user_id: Number(existingUserId), expertise: existingExpertise.trim() })
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  const retryPartial = async () => {
    setSaving(true)
    setError(null)
    try {
      await onAttach({ user_id: partial.user.user_id, expertise: partial.expertise })
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  const allEligibleUsers = [...eligibleUsers]
  if (resumeAccount && !allEligibleUsers.some((item) => item.user_id === resumeAccount.user.user_id)) allEligibleUsers.push(resumeAccount.user)

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Provision analyst" description="Create a new analyst account or attach a profile to an existing ANALYST user." size="lg">
      {mode !== 'partial' && (
        <div className="mb-5 grid grid-cols-2 rounded-lg border border-slate-700 bg-navy-900 p-1">
          <button type="button" onClick={() => { setMode('new'); setError(null) }} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === 'new' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-200'}`}>
            <UserPlus className="mr-2 inline h-4 w-4" />New account
          </button>
          <button type="button" onClick={() => { setMode('existing'); setError(null) }} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === 'existing' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-200'}`}>
            <Link2 className="mr-2 inline h-4 w-4" />Existing user
          </button>
        </div>
      )}

      {mode === 'new' && (
        <form onSubmit={submitNew}>
          <ApiFormError error={error} title="Account creation failed" />
          <div className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-400/[0.05] px-4 py-3 text-xs leading-5 text-cyan-100/70">
            Provisioning performs two server requests in order: create the ANALYST user, then create the analyst profile. A profile failure never hides or deletes a successfully created account.
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name" required error={fieldError(error, 'name')}><input className="field-input" value={account.name} onChange={updateAccount('name')} minLength={2} maxLength={120} required autoFocus /></FormField>
            <FormField label="Email" required error={fieldError(error, 'email')}><input className="field-input" type="email" value={account.email} onChange={updateAccount('email')} required /></FormField>
            <FormField label="Temporary password" required error={fieldError(error, 'password')} hint="8-128 characters."><input className="field-input" type="password" value={account.password} onChange={updateAccount('password')} minLength={8} maxLength={128} required autoComplete="new-password" /></FormField>
            <FormField label="Department" error={fieldError(error, 'department')}><input className="field-input" value={account.department} onChange={updateAccount('department')} maxLength={120} placeholder="Security Operations" /></FormField>
          </div>
          <FormField label="Expertise" required className="mt-4" error={fieldError(error, 'expertise')}><textarea className="field-input min-h-24 resize-y" value={account.expertise} onChange={updateAccount('expertise')} minLength={2} maxLength={255} required /></FormField>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" icon={UserPlus} loading={saving}>Create account and profile</Button>
          </div>
        </form>
      )}

      {mode === 'existing' && (
        <form onSubmit={submitExisting}>
          <ApiFormError error={error} title="Profile attachment failed" />
          <div className="rounded-lg border border-slate-700/70 bg-navy-900/50 p-4">
            <p className="text-sm text-slate-300">Only users whose server role is <span className="font-mono text-cyan-300">ANALYST</span> and who do not already appear in the analyst roster are eligible.</p>
          </div>
          <FormField label="Existing ANALYST user" required className="mt-4" error={fieldError(error, 'user_id')} hint={!allEligibleUsers.length ? 'No unattached ANALYST users are available.' : undefined}>
            <select className="field-input" value={existingUserId} onChange={(event) => setExistingUserId(event.target.value)} required disabled={!allEligibleUsers.length} autoFocus>
              <option value="">Select user</option>
              {allEligibleUsers.map((item) => <option key={item.user_id} value={item.user_id}>{item.name} | {item.email}</option>)}
            </select>
          </FormField>
          <FormField label="Expertise" required className="mt-4" error={fieldError(error, 'expertise')}><textarea className="field-input min-h-24 resize-y" value={existingExpertise} onChange={(event) => setExistingExpertise(event.target.value)} minLength={2} maxLength={255} required /></FormField>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" icon={Link2} loading={saving} disabled={!existingUserId || existingExpertise.trim().length < 2}>Attach profile</Button>
          </div>
        </form>
      )}

      {mode === 'partial' && partial && (
        <div>
          <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="font-semibold text-amber-100">Account created; analyst profile failed</h3>
              <p className="mt-1 text-sm leading-6 text-amber-100/70">
                {partial.user.name} ({partial.user.email}) now exists as ANALYST user #{partial.user.user_id}. No rollback was attempted. Until the profile is attached, this account will not appear in the roster or receive assignments.
              </p>
            </div>
          </div>
          <ApiFormError error={error || partial.error} title="Profile request failed" />
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-700 bg-navy-900/60 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-slate-500">Created account</p>
              <p className="truncate text-sm font-semibold text-slate-200">{partial.user.email}</p>
            </div>
            <span className="font-mono text-xs text-cyan-300">USER #{partial.user.user_id}</span>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Close and resume later</Button>
            <Button icon={Link2} onClick={retryPartial} loading={saving}>Retry profile creation</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
