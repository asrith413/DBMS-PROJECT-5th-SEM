import { useEffect, useState } from 'react'
import { AlertTriangle, Link2, Network, Plus, Unlink } from 'lucide-react'
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

const blankAsset = { name: '', type: '', ip_address: '', department: '' }

export function AssetFormDialog({ open, asset, analystMode, activeIncidentCount, onClose, onSave }) {
  const [form, setForm] = useState(blankAsset)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(asset ? {
      name: asset.name,
      type: asset.type,
      ip_address: asset.ip_address || '',
      department: asset.department,
    } : blankAsset)
    setError(null)
  }, [open, asset])

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: form.name.trim(),
        type: form.type.trim(),
        ip_address: form.ip_address.trim() || null,
        department: form.department.trim(),
      })
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={asset ? 'Edit asset' : 'Register asset'} description={asset ? 'Update fields permitted by your scoped asset access.' : 'Add an infrastructure resource to the inventory.'}>
      <form onSubmit={submit}>
        <ApiFormError error={error} />
        {!asset && analystMode && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm leading-6 ${activeIncidentCount ? 'border-cyan-500/20 bg-cyan-400/[0.05] text-cyan-100/70' : 'border-amber-500/30 bg-amber-500/[0.07] text-amber-100/80'}`}>
            An analyst-created asset remains outside your scoped inventory until it is associated with one of your active assigned incidents. {activeIncidentCount ? 'The association step opens immediately after creation.' : 'You currently have no active assigned incident, so the asset will remain pending in this page session.'}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Asset name" required error={fieldError(error, 'name')}><input className="field-input" value={form.name} onChange={update('name')} minLength={2} maxLength={150} required autoFocus /></FormField>
          <FormField label="Asset type" required error={fieldError(error, 'type')}><input className="field-input" value={form.type} onChange={update('type')} minLength={2} maxLength={100} required placeholder="Server, endpoint, gateway..." /></FormField>
          <FormField label="IP address or CIDR" error={fieldError(error, 'ip_address')} hint="Optional. IPv4, IPv6, or CIDR network."><input className="field-input font-mono" value={form.ip_address} onChange={update('ip_address')} maxLength={45} placeholder="10.20.30.40" /></FormField>
          <FormField label="Department" required error={fieldError(error, 'department')}><input className="field-input" value={form.department} onChange={update('department')} minLength={2} maxLength={120} required /></FormField>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" icon={asset ? Network : Plus} loading={saving}>{asset ? 'Save changes' : 'Register asset'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function AssetLinkDialog({ target, incidents, association, onClose, onLink }) {
  const [incidentId, setIncidentId] = useState('')
  const [impactType, setImpactType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!target) return
    setIncidentId('')
    setImpactType('')
    setError(null)
  }, [target])

  if (!target) return null
  const linkedIds = new Set((association?.items || []).map((item) => item.incident_id))
  const availableIncidents = incidents.filter((incident) => !['Resolved', 'Closed'].includes(incident.status) && !linkedIds.has(incident.incident_id))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onLink(target, Number(incidentId), impactType.trim())
      onClose()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={Boolean(target)} onClose={() => !saving && onClose()} title="Associate asset" description={`Link ${target.asset.name} to an active incident accessible to your role.`}>
      <form onSubmit={submit}>
        <ApiFormError error={error || association?.error} />
        {association?.loading ? <LoadingState compact label="Checking existing asset associations..." /> : (
          <>
            <FormField label="Active accessible incident" required hint={!availableIncidents.length ? 'No unlinked active incidents are available in your current scope.' : 'Resolved and closed incidents cannot be modified.'}>
              <select className="field-input" value={incidentId} onChange={(event) => setIncidentId(event.target.value)} required disabled={!availableIncidents.length} autoFocus>
                <option value="">Select incident</option>
                {availableIncidents.map((incident) => <option key={incident.incident_id} value={incident.incident_id}>#{incident.incident_id} | {incident.title} | {incident.status}</option>)}
              </select>
            </FormField>
            <FormField label="Impact type" required className="mt-4" error={fieldError(error, 'impact_type')} hint="Describe how this resource is affected, for example Compromised or Investigated.">
              <input className="field-input" value={impactType} onChange={(event) => setImpactType(event.target.value)} minLength={2} maxLength={120} required placeholder="Compromised" />
            </FormField>
          </>
        )}
        {target.pending && <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-100/70">This new analyst-created asset becomes visible in the scoped inventory only after this association succeeds.</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" icon={Link2} loading={saving} disabled={association?.loading || !incidentId || impactType.trim().length < 2}>Create association</Button>
        </div>
      </form>
    </Modal>
  )
}

export function AssetDetailDialog({ asset, association, onClose, onAssociate, onRequestUnlink }) {
  if (!asset) return null
  return (
    <Modal open={Boolean(asset)} onClose={onClose} title={asset.name} description="Inventory record and incident associations returned by the asset endpoint." size="xl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-navy-900/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Asset ID</p><p className="mt-1 font-mono text-sm text-cyan-300">#{asset.asset_id}</p></div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Type</p><p className="mt-1 text-sm text-slate-200">{asset.type}</p></div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Network</p><p className="mt-1 font-mono text-sm text-cyan-200">{asset.ip_address || 'Not assigned'}</p></div>
        <div className="rounded-lg border border-slate-700 bg-navy-900/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Department</p><p className="mt-1 text-sm text-slate-200">{asset.department}</p></div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div><h3 className="font-semibold text-white">Associated incidents</h3><p className="mt-1 text-xs text-slate-500">Only incidents visible to your current role are returned.</p></div>
        <Button variant="secondary" icon={Link2} onClick={() => onAssociate(asset)}>Associate</Button>
      </div>
      <div className="mt-3">
        {association?.loading ? <LoadingState compact label="Loading asset incidents..." /> : association?.error ? <ErrorState error={association.error} title="Unable to load asset incidents" /> : association?.items?.length ? (
          <div className="overflow-x-auto rounded-lg border border-slate-700/70">
            <table className="data-table min-w-[650px]">
              <thead><tr><th>Incident</th><th>Status</th><th>Impact type</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {association.items.map((incident) => {
                  const active = !['Resolved', 'Closed'].includes(incident.status)
                  return (
                    <tr key={incident.incident_id}>
                      <td><Link to={`/incidents/${incident.incident_id}`} onClick={onClose} className="font-semibold text-cyan-300 hover:text-cyan-200"><span className="mr-2 font-mono text-xs text-slate-500">#{incident.incident_id}</span>{incident.title}</Link></td>
                      <td><Badge kind="status" value={incident.status} /></td>
                      <td className="text-slate-300">{incident.impact_type}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => onRequestUnlink(asset, incident)} disabled={!active} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40" title={active ? 'Remove association' : 'Resolved and closed incidents cannot be modified'}>
                          <Unlink className="h-3.5 w-3.5" />Unlink
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="rounded-lg border border-slate-700/70"><EmptyState title="No associated incidents" message="Link this asset to an active accessible incident to establish impact context." /></div>}
      </div>
    </Modal>
  )
}
