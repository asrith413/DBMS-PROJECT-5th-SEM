import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react'

import Button from '../components/common/Button'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import { ErrorState, LoadingState } from '../components/common/States'
import DashboardCharts from '../components/dashboard/DashboardCharts'
import RecentIncidentsTable from '../components/dashboard/RecentIncidentsTable'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { INCIDENT_STATUSES, SECURITY_SEVERITIES, TERMINAL_STATUSES } from '../utils/constants'

const PAGE_SIZE = 200
const RECENT_LIMIT = 10
const numberFormatter = new Intl.NumberFormat()

function asCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function groupIncidents(incidents, selector) {
  const counts = new Map()
  incidents.forEach((incident) => {
    const rawLabel = selector(incident)
    const label = rawLabel == null ? '' : String(rawLabel).trim()
    if (label) counts.set(label, (counts.get(label) || 0) + 1)
  })
  return [...counts].map(([label, count]) => ({ label, count }))
}

function sortWithOrder(series, order) {
  const positions = new Map(order.map((label, index) => [label.toLowerCase(), index]))
  return [...series].sort((left, right) => {
    const leftPosition = positions.get(left.label.toLowerCase()) ?? order.length
    const rightPosition = positions.get(right.label.toLowerCase()) ?? order.length
    return leftPosition - rightPosition || right.count - left.count || left.label.localeCompare(right.label)
  })
}

function monthLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildScopedDashboard(incidents) {
  const byMonth = groupIncidents(incidents, (incident) => monthLabel(incident.reported_date))
    .sort((left, right) => left.label.localeCompare(right.label))
  const severityOrder = [...SECURITY_SEVERITIES].reverse()

  return {
    total_incidents: incidents.length,
    open_incidents: incidents.filter((incident) => !TERMINAL_STATUSES.has(incident.status)).length,
    resolved_incidents: incidents.filter((incident) => TERMINAL_STATUSES.has(incident.status)).length,
    critical_incidents: incidents.filter(
      (incident) => String(incident.severity?.level || '').toLowerCase() === 'critical',
    ).length,
    sla_breaches: incidents.filter((incident) => Boolean(incident.sla?.sla_breached)).length,
    incidents_by_severity: sortWithOrder(
      groupIncidents(incidents, (incident) => incident.severity?.level),
      severityOrder,
    ),
    incidents_by_status: sortWithOrder(
      groupIncidents(incidents, (incident) => incident.status),
      INCIDENT_STATUSES,
    ),
    incidents_by_type: groupIncidents(incidents, (incident) => incident.incident_type?.name)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    monthly_trends: byMonth,
  }
}

function sortRecent(incidents) {
  return [...incidents]
    .sort((left, right) => {
      const rightDate = new Date(right.reported_date).getTime()
      const leftDate = new Date(left.reported_date).getTime()
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0)
    })
    .slice(0, RECENT_LIMIT)
}

async function loadAllScopedIncidents() {
  const incidents = []
  let offset = 0

  while (true) {
    const page = await api.incidents.list({ offset, limit: PAGE_SIZE })
    if (!Array.isArray(page)) throw new Error('The incidents API returned an unexpected response.')
    incidents.push(...page)
    if (page.length < PAGE_SIZE) return incidents
    offset += page.length
  }
}

function formatSyncTime(value) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const isAdmin = user.role === 'ADMIN'
  const scopeKey = `${user.user_id}:${user.role}`

  useEffect(() => {
    let active = true

    const loadDashboard = async () => {
      setLoading(true)
      setError(null)

      try {
        let payload
        if (isAdmin) {
          const [report, incidents] = await Promise.all([
            api.reports.dashboard(),
            api.incidents.list({ limit: RECENT_LIMIT }),
          ])
          if (!report || typeof report !== 'object' || !Array.isArray(incidents)) {
            throw new Error('The dashboard API returned an unexpected response.')
          }
          payload = {
            scopeKey,
            summary: report,
            charts: report,
            recent: sortRecent(incidents),
          }
        } else {
          const incidents = await loadAllScopedIncidents()
          const scopedDashboard = buildScopedDashboard(incidents)
          payload = {
            scopeKey,
            summary: scopedDashboard,
            charts: scopedDashboard,
            recent: sortRecent(incidents),
          }
        }

        if (active) {
          setDashboard(payload)
          setLastUpdated(new Date())
        }
      } catch (requestError) {
        if (active) setError(requestError)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboard()
    return () => { active = false }
  }, [isAdmin, reloadKey, scopeKey])

  const retry = () => setReloadKey((key) => key + 1)
  const currentDashboard = dashboard?.scopeKey === scopeKey ? dashboard : null

  if (loading && !currentDashboard) {
    return <LoadingState label="Loading operational incident data..." />
  }

  if (error && !currentDashboard) {
    return <ErrorState error={error} onRetry={retry} title="Unable to load the SOC overview" />
  }

  if (!currentDashboard) {
    return <LoadingState label="Loading operational incident data..." />
  }

  const summary = currentDashboard.summary
  const total = asCount(summary.total_incidents)
  const scopeLabel = isAdmin
    ? 'the organization-wide queue'
    : user.role === 'ANALYST'
      ? 'your assigned queue'
      : 'your reported queue'
  const scopeDescription = isAdmin
    ? 'Organization-wide posture from the reporting service and current incident queue.'
    : user.role === 'ANALYST'
      ? 'Metrics and trends reflect only incidents assigned to your analyst profile.'
      : 'Metrics and trends reflect only incidents submitted from your account.'

  const metrics = [
    {
      label: 'Total incidents',
      value: total,
      icon: ShieldAlert,
      tone: 'cyan',
      detail: isAdmin ? 'Organization-wide records' : 'Records in your scope',
    },
    {
      label: 'Active',
      value: asCount(summary.open_incidents),
      icon: Activity,
      tone: 'blue',
      detail: 'Not resolved or closed',
    },
    {
      label: 'Resolved / closed',
      value: asCount(summary.resolved_incidents),
      icon: CheckCircle2,
      tone: 'green',
      detail: 'Completed workflow records',
    },
    {
      label: 'Critical',
      value: asCount(summary.critical_incidents),
      icon: AlertTriangle,
      tone: 'red',
      detail: 'Critical severity cases',
    },
    {
      label: 'SLA breaches',
      value: asCount(summary.sla_breaches),
      icon: Clock,
      tone: 'yellow',
      detail: 'Response or resolution target',
    },
  ]

  if (isAdmin) {
    metrics.push({
      label: 'Analysts',
      value: asCount(summary.analyst_count),
      icon: Users,
      tone: 'cyan',
      detail: 'Provisioned analyst profiles',
    })
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${user.role} / Operational scope`}
        title="SOC operational overview"
        description={`Welcome, ${user.name}. ${scopeDescription}`}
        actions={(
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <div className="hidden text-right sm:block">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Last synced</p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{formatSyncTime(lastUpdated)}</p>
              </div>
            )}
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={retry}>
              Refresh
            </Button>
          </div>
        )}
      />

      {error && (
        <div className="mb-6">
          <ErrorState error={error} onRetry={retry} title="Refresh failed; showing the last successful snapshot" />
        </div>
      )}

      <section
        aria-label="Incident summary"
        className={`grid min-w-0 max-w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${isAdmin ? '2xl:grid-cols-6' : '2xl:grid-cols-5'}`}
      >
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={numberFormatter.format(metric.value)}
            icon={metric.icon}
            tone={metric.tone}
            detail={metric.detail}
          />
        ))}
      </section>

      <section className="mt-8 min-w-0 max-w-full" aria-labelledby="operational-distribution-title">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-500">Operational distribution</p>
          <h2 id="operational-distribution-title" className="mt-1 text-lg font-semibold text-white">Incident posture and trends</h2>
        </div>
        <DashboardCharts data={currentDashboard.charts} isAdmin={isAdmin} />
      </section>

      <div className="mt-8 min-w-0 max-w-full">
        <RecentIncidentsTable incidents={currentDashboard.recent} total={total} scopeLabel={scopeLabel} />
      </div>
    </div>
  )
}
