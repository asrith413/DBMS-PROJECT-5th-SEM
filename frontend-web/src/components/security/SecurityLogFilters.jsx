import { RotateCcw, Search } from 'lucide-react'

import Button from '../common/Button'

export default function SecurityLogFilters({
  role,
  incidents,
  values,
  loading,
  onChange,
  onApply,
  onClear,
}) {
  const isAnalyst = role === 'ANALYST'
  const update = (field) => (event) => onChange({ ...values, [field]: event.target.value })

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block sm:col-span-2 xl:col-span-1">
          <span className="field-label">Incident</span>
          <select
            className="field-input"
            value={values.incidentId}
            onChange={update('incidentId')}
            required={isAnalyst}
            disabled={isAnalyst && incidents.length === 0}
          >
            {!isAnalyst && <option value="">All accessible incidents</option>}
            {isAnalyst && incidents.length === 0 && <option value="">No assigned incidents</option>}
            {incidents.map((incident) => (
              <option key={incident.incident_id} value={incident.incident_id}>
                #{incident.incident_id} {incident.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Severity</span>
          <select className="field-input" value={values.severity} onChange={update('severity')}>
            <option value="">All severities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">Source</span>
          <input
            className="field-input"
            value={values.source}
            onChange={update('source')}
            maxLength={100}
            placeholder="Email Gateway"
          />
        </label>

        <label className="block">
          <span className="field-label">Event type</span>
          <input
            className="field-input"
            value={values.eventType}
            onChange={update('eventType')}
            maxLength={100}
            placeholder="phishing_url"
          />
        </label>
      </div>

      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <label className="block">
          <span className="field-label">Search</span>
          <input
            type="search"
            className="field-input"
            value={values.search}
            onChange={update('search')}
            maxLength={200}
            placeholder="Description, source, event, or IP"
          />
        </label>

        <label className="block">
          <span className="field-label">Result limit</span>
          <input
            type="number"
            className="field-input tabular-nums"
            value={values.limit}
            onChange={update('limit')}
            min={1}
            max={1000}
            step={1}
            required
          />
        </label>

        <div className="flex gap-2 sm:pb-px">
          <Button
            type="submit"
            icon={Search}
            loading={loading}
            disabled={isAnalyst && incidents.length === 0}
            className="flex-1 sm:flex-none"
          >
            Apply
          </Button>
          <Button type="button" variant="secondary" icon={RotateCcw} onClick={onClear} aria-label="Clear log filters">
            Clear
          </Button>
        </div>
      </div>
    </form>
  )
}
