import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BrainCircuit, Info, Plus, Sparkles } from 'lucide-react'

import Button from '../common/Button'
import FormField from '../common/FormField'
import Modal from '../common/Modal'
import { ErrorState, LoadingState } from '../common/States'
import { useToast } from '../../context/ToastContext'
import { api } from '../../services/api'
import { formatPercent } from '../../utils/format'

const emptyForm = {
  title: '',
  description: '',
  typeId: '',
  severityId: '',
}

const evidenceFingerprint = (form) => [
  form.title.trim(),
  form.description.trim(),
  form.typeId,
].join('\n')

function mapApiFields(error) {
  return (error?.fields || []).reduce((mapped, item) => {
    const field = item.field.split('.').pop()
    mapped[field] = item.message
    return mapped
  }, {})
}

export default function CreateIncidentModal({ open, onClose, onCreated }) {
  const { notify } = useToast()
  const submitInFlight = useRef(false)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [incidentTypes, setIncidentTypes] = useState([])
  const [severities, setSeverities] = useState([])
  const [referencesLoading, setReferencesLoading] = useState(false)
  const [referencesError, setReferencesError] = useState(null)
  const [referenceReload, setReferenceReload] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [suggestionError, setSuggestionError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(emptyForm)
    setErrors({})
    setSubmitError(null)
    setSuggestion(null)
    setSuggestionError(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    let active = true
    setReferencesLoading(true)
    setReferencesError(null)

    Promise.all([api.incidentTypes.list(), api.severities.list()])
      .then(([types, severityLevels]) => {
        if (!active) return
        setIncidentTypes(types)
        setSeverities(severityLevels)
      })
      .catch((error) => {
        if (active) setReferencesError(error)
      })
      .finally(() => {
        if (active) setReferencesLoading(false)
      })

    return () => { active = false }
  }, [open, referenceReload])

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError(null)
  }

  const validateForCreate = () => {
    const next = {}
    const title = form.title.trim()
    const description = form.description.trim()
    if (title.length < 3) next.title = 'Enter at least 3 characters.'
    if (description.length < 10) next.description = 'Enter at least 10 characters.'
    if (!form.typeId) next.typeId = 'Select an incident type.'
    if (!form.severityId) next.severityId = 'Manually select the final severity.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const requestSuggestion = async () => {
    const title = form.title.trim()
    const description = form.description.trim()
    const selectedType = incidentTypes.find((item) => String(item.type_id) === String(form.typeId))
    const next = {}
    if (title.length < 3) next.title = 'Enter at least 3 characters before requesting a suggestion.'
    if (description.length < 5) next.description = 'Enter at least 5 characters before requesting a suggestion.'
    if (!selectedType) next.typeId = 'Select an incident type first.'
    if (Object.keys(next).length > 0) {
      setErrors((current) => ({ ...current, ...next }))
      return
    }

    setSuggesting(true)
    setSuggestionError(null)
    try {
      const result = await api.incidents.suggestSeverity({
        title,
        description,
        incident_type: selectedType.name,
      })
      setSuggestion({ fingerprint: evidenceFingerprint(form), result })
    } catch (error) {
      setSuggestionError(error)
      notify(`Severity suggestion failed: ${error.message}`, 'error')
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitInFlight.current || !validateForCreate()) return

    submitInFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await api.incidents.create({
        title: form.title.trim(),
        description: form.description.trim(),
        type_id: Number(form.typeId),
        severity_id: Number(form.severityId),
      })
      notify(`Incident #${created.incident_id} was created.`, 'success')
      onCreated(created)
    } catch (error) {
      setSubmitError(error)
      const apiFields = mapApiFields(error)
      setErrors((current) => ({
        ...current,
        title: apiFields.title || current.title,
        description: apiFields.description || current.description,
        typeId: apiFields.type_id || current.typeId,
        severityId: apiFields.severity_id || current.severityId,
      }))
      const prefix = error.status === 403
        ? 'Access denied'
        : error.status === 409
          ? 'Conflict'
          : error.status === 422
            ? 'Validation failed'
            : 'Incident creation failed'
      notify(`${prefix}: ${error.message}`, 'error')
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }

  const currentFingerprint = evidenceFingerprint(form)
  const currentSuggestion = suggestion?.fingerprint === currentFingerprint ? suggestion.result : null
  const staleSuggestion = Boolean(suggestion && !currentSuggestion)
  const handleClose = () => { if (!submitting) onClose() }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Report a security incident"
      description="Create an authoritative case record. Required fields are validated by CIMS."
      size="xl"
    >
      {referencesLoading && incidentTypes.length === 0 && severities.length === 0 ? (
        <LoadingState label="Loading incident classifications and SLA severities..." compact />
      ) : referencesError ? (
        <ErrorState
          error={referencesError}
          title="Unable to load incident reference data"
          onRetry={() => setReferenceReload((value) => value + 1)}
        />
      ) : incidentTypes.length === 0 || severities.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          Incident types and severity levels must exist before a report can be submitted.
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-slate-700/60 pb-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-400/10 text-xs font-bold text-cyan-300">1</span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Incident evidence</h3>
                  <p className="text-xs text-slate-500">Describe the observed event without including credentials or secrets.</p>
                </div>
              </div>

              <FormField label="Title" required error={errors.title} hint={`${form.title.length}/200 characters`}>
                <input
                  className="field-input"
                  value={form.title}
                  onChange={(event) => setField('title', event.target.value)}
                  maxLength={200}
                  placeholder="Concise description of the observed event"
                  autoFocus
                />
              </FormField>

              <FormField label="Description" required error={errors.description} hint={`${form.description.length}/10000 characters`}>
                <textarea
                  className="field-input min-h-40 resize-y"
                  value={form.description}
                  onChange={(event) => setField('description', event.target.value)}
                  maxLength={10000}
                  placeholder="What happened, when it was observed, and what appears affected?"
                />
              </FormField>

              <FormField label="Incident type" required error={errors.typeId}>
                <select className="field-input" value={form.typeId} onChange={(event) => setField('typeId', event.target.value)}>
                  <option value="">Select a classification</option>
                  {incidentTypes.map((type) => (
                    <option key={type.type_id} value={type.type_id}>{type.name}</option>
                  ))}
                </select>
              </FormField>

              {form.typeId && (
                <p className="-mt-3 rounded-lg border border-slate-700/60 bg-navy-900/60 px-3 py-2 text-xs leading-5 text-slate-500">
                  {incidentTypes.find((item) => String(item.type_id) === String(form.typeId))?.description}
                </p>
              )}
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-slate-700/60 pb-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-400/10 text-xs font-bold text-violet-300">2</span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Severity decision</h3>
                  <p className="text-xs text-slate-500">Advisory output and final selection remain separate.</p>
                </div>
              </div>

              <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
                  <div>
                    <h4 className="text-sm font-semibold text-violet-100">ML severity advisory</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-400">The advisory never changes the final severity field.</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  icon={Sparkles}
                  loading={suggesting}
                  onClick={requestSuggestion}
                  className="mt-4 w-full"
                >
                  Generate suggestion
                </Button>

                {currentSuggestion && (
                  <div className="mt-4 rounded-lg border border-violet-400/25 bg-navy-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Suggested</span>
                      <span className="text-sm font-bold text-violet-200">{currentSuggestion.suggested_severity}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">Model confidence</span>
                      <span className="font-mono text-xs text-slate-300">{formatPercent(currentSuggestion.confidence)}</span>
                    </div>
                    <p className="mt-3 border-t border-slate-700/60 pt-3 text-[11px] leading-5 text-slate-500">
                      {currentSuggestion.disclaimer}
                    </p>
                  </div>
                )}

                {staleSuggestion && (
                  <div className="mt-3 flex gap-2 text-xs leading-5 text-amber-300/80">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Evidence changed. Generate a new suggestion before relying on the advisory.
                  </div>
                )}
                {suggestionError && <p className="mt-3 text-xs text-red-300">{suggestionError.message}</p>}
              </div>

              <FormField
                label="Final severity"
                required
                error={errors.severityId}
                hint="This manual selection is submitted to CIMS."
              >
                <select className="field-input" value={form.severityId} onChange={(event) => setField('severityId', event.target.value)}>
                  <option value="">Select final severity</option>
                  {severities.map((severity) => (
                    <option key={severity.severity_id} value={severity.severity_id}>
                      {severity.level} | response {severity.response_sla_hours}h | resolution {severity.resolution_sla_hours}h
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="flex gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-xs leading-5 text-slate-400">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                The selected severity establishes response and resolution deadlines when the incident is created.
              </div>
            </div>
          </div>

          {submitError && (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">The incident was not created.</p>
                <p className="mt-1 text-xs text-red-300/80">{submitError.message}</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-700/60 pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" icon={Plus} loading={submitting}>Submit incident</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
