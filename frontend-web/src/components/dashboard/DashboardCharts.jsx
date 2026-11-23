import { ChartNoAxesCombined } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../../context/ThemeContext'

function useChartColors() {
  const { isDark } = useTheme()

  if (isDark) {
    return {
      axis: '#7890aa',
      grid: '#17304b',
      label: '#a8b8cb',
      cyan: '#22d3ee',
      accent: '#2dd4bf',
      chartColors: ['#22d3ee', '#60a5fa', '#a78bfa', '#2dd4bf', '#f59e0b', '#f472b6'],
      severity: {
        critical: '#fb7185',
        high: '#fb923c',
        medium: '#facc15',
        low: '#60a5fa',
      },
      status: {
        open: '#60a5fa',
        assigned: '#a78bfa',
        'under investigation': '#22d3ee',
        'in progress': '#facc15',
        resolved: '#34d399',
        closed: '#10b981',
      },
      pieStroke: '#0a1728',
      pieCenterText: '#f8fafc',
      tooltip: {
        contentStyle: {
          background: '#07111f',
          border: '1px solid #29435f',
          borderRadius: '10px',
          boxShadow: '0 14px 30px rgba(0, 0, 0, 0.32)',
          color: '#e2e8f0',
          fontSize: '12px',
        },
        itemStyle: { color: '#cbd5e1' },
        labelStyle: { color: '#f8fafc', fontWeight: 600, marginBottom: '4px' },
      },
      cursor: 'rgba(34, 211, 238, 0.04)',
      trendStop1: 0.32,
      trendStop2: 0.01,
      dotFill: '#07111f',
    }
  }

  return {
    axis: '#64748b',
    grid: '#e2e8f0',
    label: '#334155',
    cyan: '#0284c7', // rich ocean blue/cyan (high contrast on white)
    accent: '#059669', // rich emerald green
    chartColors: ['#0284c7', '#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777'],
    severity: {
      critical: '#dc2626', // strong crimson red (high visibility)
      high: '#ea580c',     // strong deep orange
      medium: '#d97706',   // strong deep amber/gold
      low: '#2563eb',      // strong deep royal blue
    },
    status: {
      open: '#2563eb',              // strong blue
      assigned: '#7c3aed',          // strong purple
      'under investigation': '#0284c7', // strong ocean cyan
      'in progress': '#d97706',      // strong amber
      resolved: '#059669',          // strong emerald
      closed: '#047857',            // deep forest green
    },
    pieStroke: '#ffffff',
    pieCenterText: '#0f172a',
    tooltip: {
      contentStyle: {
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        color: '#0f172a',
        fontSize: '12px',
      },
      itemStyle: { color: '#334155' },
      labelStyle: { color: '#0f172a', fontWeight: 600, marginBottom: '4px' },
    },
    cursor: 'rgba(2, 132, 199, 0.08)',
    trendStop1: 0.45,
    trendStop2: 0.04,
    dotFill: '#ffffff',
  }
}

function normalizeSeries(series) {
  if (!Array.isArray(series)) return []
  return series
    .map((item) => ({
      label: String(item?.label ?? '').trim(),
      count: Number(item?.count),
    }))
    .filter((item) => item.label && Number.isFinite(item.count) && item.count >= 0)
}

function shortenLabel(value, maxLength = 20) {
  const label = String(value)
  return label.length > maxLength ? `${label.slice(0, maxLength - 3)}...` : label
}

function formatMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value))
  if (!match) return String(value)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date)
}

function ChartFrame({ title, description, empty, emptyMessage, height = 288, children }) {
  return (
    <article className="panel min-w-0 max-w-full overflow-hidden">
      <header className="border-b border-slate-700/60 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </header>
      <div className="p-4 sm:p-5">
        {empty ? (
          <div className="grid place-items-center text-center" style={{ height }}>
            <div>
              <ChartNoAxesCombined className="mx-auto h-6 w-6 text-slate-600" />
              <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
            </div>
          </div>
        ) : (
          <div className="min-w-0 max-w-full overflow-hidden" style={{ height }} role="img" aria-label={`${title}. ${description}`}>
            {children}
          </div>
        )}
      </div>
    </article>
  )
}

function SeverityChart({ series }) {
  const colors = useChartColors()
  const data = normalizeSeries(series)
  const total = data.reduce((sum, item) => sum + item.count, 0)

  return (
    <ChartFrame
      title="Severity distribution"
      description="Incident volume grouped by assigned severity."
      empty={total === 0}
      emptyMessage="No severity data in this scope."
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="46%"
            innerRadius="53%"
            outerRadius="75%"
            paddingAngle={2}
            stroke={colors.pieStroke}
            strokeWidth={2}
          >
            {data.map((item, index) => (
              <Cell
                key={item.label}
                fill={colors.severity[item.label.toLowerCase()] || colors.chartColors[index % colors.chartColors.length]}
              />
            ))}
          </Pie>
          <text x="50%" y="43%" textAnchor="middle" fill={colors.pieCenterText} fontSize="24" fontWeight="700">
            {total.toLocaleString()}
          </text>
          <text x="50%" y="51%" textAnchor="middle" fill={colors.axis} fontSize="10" letterSpacing="1.4">
            INCIDENTS
          </text>
          <Tooltip {...colors.tooltip} formatter={(value) => [Number(value).toLocaleString(), 'Incidents']} />
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            wrapperStyle={{ color: colors.label, fontSize: '11px', paddingTop: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function StatusChart({ series }) {
  const colors = useChartColors()
  const data = normalizeSeries(series)

  return (
    <ChartFrame
      title="Workflow status"
      description="Current position of incidents in the response lifecycle."
      empty={data.length === 0}
      emptyMessage="No workflow status data in this scope."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, bottom: 2, left: 6 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={112}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 11 }}
            tickFormatter={(value) => shortenLabel(value, 18)}
          />
          <Tooltip
            {...colors.tooltip}
            cursor={{ fill: colors.cursor }}
            formatter={(value) => [Number(value).toLocaleString(), 'Incidents']}
          />
          <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={22}>
            {data.map((item, index) => (
              <Cell
                key={item.label}
                fill={colors.status[item.label.toLowerCase()] || colors.chartColors[index % colors.chartColors.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function TypeChart({ series }) {
  const colors = useChartColors()
  const data = normalizeSeries(series)
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const height = Math.max(288, data.length * 38)

  return (
    <ChartFrame
      title="Incident types"
      description="Case mix across the recorded incident classifications."
      empty={total === 0}
      emptyMessage="No incident type data in this scope."
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, bottom: 2, left: 6 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={112}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 11 }}
            tickFormatter={(value) => shortenLabel(value, 18)}
          />
          <Tooltip
            {...colors.tooltip}
            cursor={{ fill: colors.cursor }}
            formatter={(value) => [Number(value).toLocaleString(), 'Incidents']}
          />
          <Bar dataKey="count" fill={colors.cyan} radius={[0, 5, 5, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function MonthlyChart({ series }) {
  const colors = useChartColors()
  const data = normalizeSeries(series)

  return (
    <ChartFrame
      title="Monthly trend"
      description="Reported incident volume over time."
      empty={data.length === 0}
      emptyMessage="No monthly incident history in this scope."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 2, left: -18 }}>
          <defs>
            <linearGradient id="incidentTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.cyan} stopOpacity={colors.trendStop1} />
              <stop offset="100%" stopColor={colors.cyan} stopOpacity={colors.trendStop2} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
            tick={{ fill: colors.axis, fontSize: 11 }}
            tickFormatter={formatMonth}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 11 }} />
          <Tooltip
            {...colors.tooltip}
            labelFormatter={formatMonth}
            formatter={(value) => [Number(value).toLocaleString(), 'Reported incidents']}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={colors.cyan}
            strokeWidth={2.5}
            fill="url(#incidentTrendFill)"
            activeDot={{ r: 5, fill: colors.dotFill, stroke: colors.cyan, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function WorkloadChart({ series }) {
  const colors = useChartColors()
  const data = normalizeSeries(series)
  const height = Math.max(240, data.length * 38)

  return (
    <div className="min-w-0 max-w-full lg:col-span-2">
      <ChartFrame
        title="Analyst workload"
        description="Current workload recorded for each provisioned analyst."
        empty={data.length === 0}
        emptyMessage="No analyst workload data is available."
        height={height}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 2, left: 8 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={132}
              axisLine={false}
              tickLine={false}
              tick={{ fill: colors.label, fontSize: 11 }}
              tickFormatter={(value) => shortenLabel(value, 22)}
            />
            <Tooltip
              {...colors.tooltip}
              cursor={{ fill: colors.cursor }}
              formatter={(value) => [Number(value).toLocaleString(), 'Active workload']}
            />
            <Bar dataKey="count" fill={colors.accent} radius={[0, 5, 5, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  )
}

export default function DashboardCharts({ data, isAdmin }) {
  return (
    <div className="grid min-w-0 max-w-full items-start gap-5 lg:grid-cols-2">
      <SeverityChart series={data?.incidents_by_severity} />
      <StatusChart series={data?.incidents_by_status} />
      <TypeChart series={data?.incidents_by_type} />
      <MonthlyChart series={data?.monthly_trends} />
      {isAdmin && <WorkloadChart series={data?.analyst_workload} />}
    </div>
  )
}
