import { useEffect, useState } from 'react'
import { AlertTriangle, Link2, Plus, Radar, Unlink } from 'lucide-react'
import { Link } from 'react-router-dom'

import Badge from '../common/Badge'
import Button from '../common/Button'
import FormField from '../common/FormField'
import Modal from '../common/Modal'
import { EmptyState, ErrorState, LoadingState } from '../common/States'

const fieldError = (error, field) => error?.fields?.find((item) => item.field.split('.').at(-1) === field)?.message

function ApiFormError({ error }) {
  if (!error) return null
  return (
    <div className="mb-4 flex gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-200" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div><p className="font-semibold">Request failed{error.status ? ` | HTTP ${error.status}` : ''}</p><p className="mt-1 text-red-300/80">{error.message}</p></div>
    </div>
  )
}

export function ThreatActorFormDialog({ open, actor, onClose, onSave }) {
  const [alias, setAlias] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setAlias(actor?.alias || '')
    setDescription(actor?.description || '')
    setError(null)
  }, [open, actor])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ alias: alias.trim(), description: description.trim() })
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={actor ? 'Edit threat actor' : 'Register threat actor'} description={actor ? 'Update the tracked alias and intelligence summary.' : 'Add an adversary identity to the controlled directory.'}>
      <form onSubmit={submit}>
        <ApiFormError error={error} />
        <FormField label="Alias" required error={fieldError(error, 'alias')}><input className="field-input" value={alias} onChange={(event) => setAlias(event.target.value)} minLength={2} maxLength={120} required autoFocus /></FormField>
        <FormField label="Intelligence summary" required className="mt-4" error={fieldError(error, 'description')}><textarea className="field-input min-h-36 resize-y" value={description} onChange={(event) => setDescription(event.target.value)} minLength={3} maxLength={4000} required /></FormField>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" icon={actor ? Radar : Plus} loading={saving}>{actor ? 'Save changes' : 'Register actor'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function ThreatActorLinkDialog({ actor, incidentDetails, mappingLoading, mappingError, onClose, onLink }) {
  const [incidentId, setIncidentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!actor) return
    setIncidentId('')
    setError(null)
  }, [actor])

  if (!actor) return null
  const available = incidentDetails.filter((incident) => {
    if (['Resolved', 'Closed'].includes(incident.status)) return false
    return !(incident.threat_actors || []).some((link) => link.actor_id === actor.actor_id)
  })

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onLink(actor, Number(incidentId))
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={Boolean(actor)} onClose={() => !saving && onClose()} title="Link threat actor" description={`Associate ${actor.alias} with an active incident in your accessible scope.`}>
      <form onSubmit={submit}>
        <ApiFormError error={error || mappingError} />
        {mappingLoading ? <LoadingState compact label="Inspecting accessible incident details..." /> : (
          <FormField label="Active accessible incident" required hint={!available.length ? 'No active unlinked incident is available from the details loaded for your role.' : 'Only loaded, accessible, non-terminal incidents are eligible.'}>
            <select className="field-input" value={incidentId} onChange={(event) => setIncidentId(event.target.value)} required disabled={!available.length} autoFocus>
              <option value="">Select incident</option>
              {available.map((incident) => <option key={incident.incident_id} value={incident.incident_id}>#{incident.incident_id} | {incident.title} | {incident.status}</option>)}
            </select>
          </FormField>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" icon={Link2} loading={saving} disabled={mappingLoading || !incidentId}>Create link</Button>
        </div>
      </form>
    </Modal>
  )
}

export function ThreatActorDetailDialog({ actor, incidents, mappingLoading, mappingError, onClose, onLink, onRequestUnlink }) {
  if (!actor) return null
  return (
    <Modal open={Boolean(actor)} onClose={onClose} title={actor.alias} description="Threat intelligence record and links derived from accessible incident details." size="xl">
      <div className="rounded-lg border border-slate-700/70 bg-navy-900/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300"><Radar className="h-5 w-5" /></span>
          <div><p className="font-mono text-xs text-red-300">ACTOR #{actor.actor_id}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{actor.description}</p></div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div><h3 className="font-semibold text-white">Associated incidents</h3><p className="mt-1 text-xs text-slate-500">Derived client-side because the API has no actor-to-incident list endpoint.</p></div>
        <Button variant="secondary" icon={Link2} onClick={() => onLink(actor)} disabled={mappingLoading}>Link incident</Button>
      </div>
      <div className="mt-3">
        {mappingLoading ? <LoadingState compact label="Deriving actor associations from incident details..." /> : mappingError && !incidents.length ? <ErrorState error={mappingError} title="Unable to derive incident associations" /> : incidents.length ? (
          <>
            {mappingError && <div className="mb-3"><ErrorState error={mappingError} title="Some incident details could not be inspected" /></div>}
            <div className="overflow-x-auto rounded-lg border border-slate-700/70">
              <table className="data-table min-w-[650px]">
                <thead><tr><th>Incident</th><th>Status</th><th>Severity</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {incidents.map((incident) => {
                    const active = !['Resolved', 'Closed'].includes(incident.status)
                    return (
                      <tr key={incident.incident_id}>
                        <td><Link to={`/incidents/${incident.incident_id}`} onClick={onClose} className="font-semibold text-cyan-300 hover:text-cyan-200"><span className="mr-2 font-mono text-xs text-slate-500">#{incident.incident_id}</span>{incident.title}</Link></td>
                        <td><Badge kind="status" value={incident.status} /></td>
                        <td><Badge kind="severity" value={incident.severity?.level} /></td>
                        <td className="text-right"><button type="button" onClick={() => onRequestUnlink(actor, incident)} disabled={!active} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40" title={active ? 'Remove association' : 'Resolved and closed incidents cannot be modified'}><Unlink className="h-3.5 w-3.5" />Unlink</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="rounded-lg border border-slate-700/70"><EmptyState title="No accessible incident links" message="This actor is not present in any incident detail currently accessible to your role." /></div>}
      </div>
    </Modal>
  )
}
