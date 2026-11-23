import { RotateCcw, Search } from 'lucide-react'

import Button from '../common/Button'

export default function AuditFilters({ role, incidents, values, loading, onChange, onApply, onClear }) {
  const isAnalyst = role === 'ANALYST'

  return (
    <form
      className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <label className="block">
        <span className="field-label">Incident scope</span>
        <select
          className="field-input"
          value={values.incidentId}
          onChange={(event) => onChange({ ...values, incidentId: event.target.value })}
          required={isAnalyst}
          disabled={isAnalyst && incidents.length === 0}
        >
          {!isAnalyst && <option value="">All incidents</option>}
          {isAnalyst && incidents.length === 0 && <option value="">No assigned incidents</option>}
          {incidents.map((incident) => (
            <option key={incident.incident_id} value={incident.incident_id}>
              #{incident.incident_id} {incident.title}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="field-label">Result limit</span>
        <input
          type="number"
          className="field-input tabular-nums"
          value={values.limit}
          onChange={(event) => onChange({ ...values, limit: event.target.value })}
          min={1}
          max={1000}
          step={1}
          required
        />
      </label>

      <div className="flex gap-2 sm:pb-px">
        <Button type="submit" icon={Search} loading={loading} disabled={isAnalyst && incidents.length === 0} className="flex-1 sm:flex-none">
          Apply
        </Button>
        <Button type="button" variant="secondary" icon={RotateCcw} onClick={onClear} aria-label="Clear audit filters">
          Clear
        </Button>
      </div>
    </form>
  )
}
