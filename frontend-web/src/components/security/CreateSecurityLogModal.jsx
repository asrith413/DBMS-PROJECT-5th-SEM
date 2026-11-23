import { useEffect, useState } from 'react'
import { Clock3, Database, Send } from 'lucide-react'

import Button from '../common/Button'
import FormField from '../common/FormField'
import Modal from '../common/Modal'

const blankForm = (incidentId = '') => ({
  incidentId: incidentId ? String(incidentId) : '',
  source: '',
  eventType: '',
  sourceIp: '',
  destinationIp: '',
  severity: 'Medium',
  timestamp: localDateTimeValue(),
  description: '',
  metadata: '{}',
})

function localDateTimeValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19)
}

function isValidIpv4(value) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith('0'))) return false
    return Number(part) <= 255
  })
}

function isValidIpv6(value) {
  const scopedAddress = value.split('%')
  if (scopedAddress.length > 2 || (scopedAddress.length === 2 && !scopedAddress[1])) return false
  const address = scopedAddress[0]
  if (!address.includes(':') || address.split('::').length > 2) return false
  const compressed = address.includes('::')
  if (!compressed && (address.startsWith(':') || address.endsWith(':'))) return false

  const sides = address.split('::')
  const groups = sides.flatMap((side) => side ? side.split(':') : [])
  if (groups.some((group) => !group)) return false

  let groupCount = groups.length
  const ipv4Index = groups.findIndex((group) => group.includes('.'))
  if (ipv4Index !== -1) {
    if (ipv4Index !== groups.length - 1 || address.endsWith('::') || !isValidIpv4(groups[ipv4Index])) return false
    groupCount += 1
  }
  if (groups.some((group, index) => index !== ipv4Index && !/^[0-9a-fA-F]{1,4}$/.test(group))) return false
  return compressed ? groupCount < 8 : groupCount === 8
}

function isValidIp(value) {
  return isValidIpv4(value) || isValidIpv6(value)
}

export default function CreateSecurityLogModal({ open, onClose, incidents, onCreate }) {
  const defaultIncidentId = incidents[0]?.incident_id || ''
  const [form, setForm] = useState(() => blankForm(defaultIncidentId))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(blankForm(defaultIncidentId))
    setErrors({})
  }, [open, defaultIncidentId])

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }))
  }

  const timestampDate = new Date(form.timestamp)
  const timestampPreview = form.timestamp && !Number.isNaN(timestampDate.getTime())
    ? timestampDate.toISOString()
    : 'Enter a valid date and time.'

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    const source = form.source.trim()
    const eventType = form.eventType.trim()
    const description = form.description.trim()
    const sourceIp = form.sourceIp.trim()
    const destinationIp = form.destinationIp.trim()
    const incidentId = Number(form.incidentId)
    const activeIncidentIds = new Set(incidents.map((incident) => Number(incident.incident_id)))

    if (!activeIncidentIds.has(incidentId)) nextErrors.incidentId = 'Select an accessible active incident.'
    if (source.length < 2 || source.length > 100) nextErrors.source = 'Source must contain 2 to 100 characters.'
    if (eventType.length < 2 || eventType.length > 100) nextErrors.eventType = 'Event type must contain 2 to 100 characters.'
    if (description.length < 3 || description.length > 5000) nextErrors.description = 'Description must contain 3 to 5000 characters.'
    if (sourceIp && (sourceIp.length > 45 || !isValidIp(sourceIp))) nextErrors.sourceIp = 'Enter a valid IPv4 or IPv6 address.'
    if (destinationIp && (destinationIp.length > 45 || !isValidIp(destinationIp))) nextErrors.destinationIp = 'Enter a valid IPv4 or IPv6 address.'
    if (!['Low', 'Medium', 'High', 'Critical'].includes(form.severity)) nextErrors.severity = 'Select a supported severity.'
    if (!form.timestamp || Number.isNaN(timestampDate.getTime())) nextErrors.timestamp = 'Enter a valid event timestamp.'

    let metadata
    try {
      metadata = JSON.parse(form.metadata || '{}')
      if (metadata === null || Array.isArray(metadata) || typeof metadata !== 'object') {
        nextErrors.metadata = 'Metadata must be a JSON object, not an array or primitive.'
      }
    } catch (error) {
      nextErrors.metadata = `Invalid JSON: ${error.message}`
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await onCreate({
        incident_id: incidentId,
        source,
        event_type: eventType,
        source_ip: sourceIp || null,
        destination_ip: destinationIp || null,
        timestamp: timestampDate.toISOString(),
        severity: form.severity,
        description,
        metadata,
      })
    } catch (error) {
      setErrors((current) => ({ ...current, form: error.message || 'The security log could not be created.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Add security log"
      description="Attach investigation telemetry to an active incident. Existing records are read-only in this console."
      size="xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {errors.form && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300" role="alert">
            {errors.form}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Active incident" required error={errors.incidentId} className="md:col-span-2">
            <select className="field-input" value={form.incidentId} onChange={update('incidentId')} required>
              {incidents.map((incident) => (
                <option key={incident.incident_id} value={incident.incident_id}>
                  #{incident.incident_id} {incident.title} / {incident.status}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Source" required error={errors.source}>
            <input className="field-input" value={form.source} onChange={update('source')} maxLength={100} placeholder="Email Gateway" autoFocus />
          </FormField>
          <FormField label="Event type" required error={errors.eventType}>
            <input className="field-input font-mono" value={form.eventType} onChange={update('eventType')} maxLength={100} placeholder="phishing_url" />
          </FormField>

          <FormField label="Source IP" error={errors.sourceIp} hint="Optional IPv4 or IPv6 address">
            <input className="field-input font-mono" value={form.sourceIp} onChange={update('sourceIp')} maxLength={45} placeholder="198.51.100.10" spellCheck="false" />
          </FormField>
          <FormField label="Destination IP" error={errors.destinationIp} hint="Optional IPv4 or IPv6 address">
            <input className="field-input font-mono" value={form.destinationIp} onChange={update('destinationIp')} maxLength={45} placeholder="10.1.1.25" spellCheck="false" />
          </FormField>

          <FormField label="Severity" required error={errors.severity}>
            <select className="field-input" value={form.severity} onChange={update('severity')}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </FormField>
          <FormField label="Event timestamp (local input)" required error={errors.timestamp} hint={`UTC ISO payload: ${timestampPreview}`}>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input type="datetime-local" className="field-input pl-10" value={form.timestamp} onChange={update('timestamp')} step={1} required />
            </div>
          </FormField>
        </div>

        <FormField label="Description" required error={errors.description}>
          <textarea className="field-input min-h-28 resize-y" value={form.description} onChange={update('description')} maxLength={5000} placeholder="Describe the observed event and its investigation relevance." />
        </FormField>

        <FormField label="Metadata (JSON object)" required error={errors.metadata} hint="Only a JSON object is accepted, for example: {&quot;blocked&quot;: true}">
          <div className="relative">
            <Database className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <textarea className="field-input min-h-32 resize-y pl-10 font-mono text-xs leading-6" value={form.metadata} onChange={update('metadata')} spellCheck="false" />
          </div>
        </FormField>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-700 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" icon={Send} loading={submitting}>Create log</Button>
        </div>
      </form>
    </Modal>
  )
}
