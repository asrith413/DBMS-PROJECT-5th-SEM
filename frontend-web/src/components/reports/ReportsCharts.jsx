import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, CalendarRange, ChartPie, Layers3, UsersRound } from 'lucide-react'

import { EmptyState } from '../common/States'
import { useTheme } from '../../context/ThemeContext'

function useReportsChartTheme() {
  const { isDark } = useTheme()
  if (isDark) {
    return {
      palette: ['#22d3ee', '#60a5fa', '#a78bfa', '#fbbf24', '#fb7185', '#34d399', '#f97316'],
      severityColors: {
        Critical: '#f87171',
        High: '#fb923c',
        Medium: '#facc15',
        Low: '#60a5fa',
      },
      pieStroke: '#0a1728',
      cyan: '#22d3ee',
      blue: '#60a5fa',
      purple: '#a78bfa',
      grid: '#1e293b',
      axis: '#64748b',
      tick: '#94a3b8',
      tooltip: {
        background: '#07111f',
        border: '1px solid #334155',
        borderRadius: '8px',
        boxShadow: '0 14px 30px rgba(0,0,0,.3)',
        color: '#e2e8f0',
        fontSize: '12px',
      },
      itemColor: '#67e8f9',
      cursorCyan: 'rgba(34,211,238,.04)',
      cursorBlue: 'rgba(96,165,250,.04)',
      cursorPurple: 'rgba(167,139,250,.04)',
      trendStop1: 0.35,
      trendStop2: 0.01,
      dotFill: '#67e8f9',
      dotStroke: '#07111f',
    }
  }

  return {
    palette: ['#0284c7', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#059669', '#ea580c'],
    severityColors: {
      Critical: '#dc2626', // strong crimson red (high visibility)
      High: '#ea580c',     // strong deep orange
      Medium: '#d97706',   // strong deep amber/gold
      Low: '#2563eb',      // strong royal blue
    },
    pieStroke: '#ffffff',
    cyan: '#0284c7', // rich ocean blue/cyan
    blue: '#2563eb', // rich royal blue
    purple: '#7c3aed', // rich violet
    grid: '#e2e8f0',
    axis: '#64748b',
    tick: '#334155',
    tooltip: {
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0,0,0,.1)',
      color: '#0f172a',
      fontSize: '12px',
    },
    itemColor: '#0284c7',
    cursorCyan: 'rgba(2,132,199,.08)',
    cursorBlue: 'rgba(37,99,235,.08)',
    cursorPurple: 'rgba(124,58,237,.08)',
    trendStop1: 0.45,
    trendStop2: 0.04,
    dotFill: '#ffffff',
    dotStroke: '#0284c7',
  }
}

function ChartPanel({ icon: Icon, eyebrow, title, description, children, className = '' }) {
  return (
    <section className={`panel min-w-0 overflow-hidden ${className}`}>
      <div className="panel-header">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">{eyebrow}</p>
          <h2 className="mt-1 font-semibold text-white">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function NoChartData({ message }) {
  return <EmptyState title="No chart data" message={message} />
}

function SeverityChart({ data }) {
  const theme = useReportsChartTheme()
  const chartData = data.filter((item) => Number(item.count) > 0)
  return (
    <ChartPanel icon={ChartPie} eyebrow="Composition" title="Incidents by severity" description="All incident states in the dashboard report.">
      {!chartData.length ? <NoChartData message="No incidents are available for a severity distribution." /> : (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="count" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={3} stroke={theme.pieStroke} strokeWidth={3}>
                  {chartData.map((item, index) => <Cell key={item.label} fill={theme.severityColors[item.label] || theme.palette[index % theme.palette.length]} />)}
                </Pie>
                <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.tooltip.color }} formatter={(value) => [value, 'Incidents']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {data.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-navy-900/60 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: theme.severityColors[item.label] || theme.palette[index % theme.palette.length] }} /><span className="truncate">{item.label}</span></span>
                <span className="font-mono text-sm font-semibold text-slate-200">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartPanel>
  )
}

function StatusChart({ data }) {
  const theme = useReportsChartTheme()
  const hasData = data.some((item) => Number(item.count) > 0)
  return (
    <ChartPanel icon={BarChart3} eyebrow="Workflow" title="Incidents by status" description="Current lifecycle status counts.">
      {!hasData ? <NoChartData message="No incidents are available for a status distribution." /> : (
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 6, left: -20, bottom: 4 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" stroke={theme.axis} tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={data.length > 4 ? -18 : 0} textAnchor={data.length > 4 ? 'end' : 'middle'} height={data.length > 4 ? 56 : 30} />
              <YAxis allowDecimals={false} stroke={theme.axis} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: theme.cursorCyan }} contentStyle={theme.tooltip} itemStyle={{ color: theme.itemColor }} formatter={(value) => [value, 'Incidents']} />
              <Bar dataKey="count" fill={theme.cyan} radius={[5, 5, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  )
}

function TypeChart({ data }) {
  const theme = useReportsChartTheme()
  const hasData = data.some((item) => Number(item.count) > 0)
  const height = Math.max(240, data.length * 42)
  return (
    <ChartPanel icon={Layers3} eyebrow="Classification" title="Incidents by type" description="Counts grouped by configured incident type.">
      {!hasData ? <NoChartData message="No incidents are available for a type distribution." /> : (
        <div className="min-w-0" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke={theme.axis} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={110} stroke={theme.axis} tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: theme.cursorBlue }} contentStyle={theme.tooltip} itemStyle={{ color: theme.blue }} formatter={(value) => [value, 'Incidents']} />
              <Bar dataKey="count" fill={theme.blue} radius={[0, 5, 5, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  )
}

function TrendChart({ data }) {
  const theme = useReportsChartTheme()
  const hasData = data.some((item) => Number(item.count) > 0)
  return (
    <ChartPanel icon={CalendarRange} eyebrow="Trend" title="Monthly incident volume" description="Incidents grouped by reported year and month.">
      {!hasData ? <NoChartData message="No monthly incident history is available." /> : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 4 }}>
              <defs>
                <linearGradient id="monthlyIncidentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.cyan} stopOpacity={theme.trendStop1} />
                  <stop offset="100%" stopColor={theme.cyan} stopOpacity={theme.trendStop2} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" stroke={theme.axis} tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} stroke={theme.axis} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.cyan }} formatter={(value) => [value, 'Reported incidents']} />
              <Area type="monotone" dataKey="count" stroke={theme.cyan} strokeWidth={2.5} fill="url(#monthlyIncidentFill)" activeDot={{ r: 5, fill: theme.dotFill, stroke: theme.dotStroke, strokeWidth: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  )
}

function WorkloadChart({ data }) {
  const theme = useReportsChartTheme()
  const height = Math.max(230, data.length * 44)
  return (
    <ChartPanel icon={UsersRound} eyebrow="Capacity" title="Analyst workload" description="Current workload values maintained by analyst assignments." className="xl:col-span-2">
      {!data.length ? <NoChartData message="No analyst workload records are available." /> : (
        <div className="min-w-0" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 16, bottom: 4 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} domain={[0, (maximum) => Math.max(1, maximum)]} stroke={theme.axis} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={125} stroke={theme.axis} tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: theme.cursorPurple }} contentStyle={theme.tooltip} itemStyle={{ color: theme.purple }} formatter={(value) => [value, 'Workload']} />
              <Bar dataKey="count" fill={theme.purple} radius={[0, 5, 5, 0]} maxBarSize={25} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  )
}

export default function ReportsCharts({ report }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SeverityChart data={report.incidents_by_severity || []} />
      <StatusChart data={report.incidents_by_status || []} />
      <TypeChart data={report.incidents_by_type || []} />
      <TrendChart data={report.monthly_trends || []} />
      <WorkloadChart data={report.analyst_workload || []} />
    </div>
  )
}
