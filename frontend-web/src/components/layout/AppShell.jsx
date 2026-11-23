import { useEffect, useState } from 'react'
import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  ChevronLeft,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RadioTower,
  Shield,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import ThemeToggle from '../common/ThemeToggle'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

const navigation = [
  { to: '/dashboard', label: 'SOC Overview', icon: LayoutDashboard, roles: ['ADMIN', 'ANALYST', 'REPORTER'] },
  { to: '/incidents', label: 'Incidents', icon: ShieldAlert, roles: ['ADMIN', 'ANALYST', 'REPORTER'] },
  { to: '/security-logs', label: 'Security Logs', icon: RadioTower, roles: ['ADMIN', 'ANALYST'] },
  { to: '/analysts', label: 'Analysts', icon: Users, roles: ['ADMIN'] },
  { to: '/assets', label: 'Assets', icon: Boxes, roles: ['ADMIN', 'ANALYST'] },
  { to: '/threat-actors', label: 'Threat Actors', icon: Activity, roles: ['ADMIN', 'ANALYST'] },
  { to: '/audit', label: 'Audit Trail', icon: FileClock, roles: ['ADMIN', 'ANALYST'] },
  { to: '/reports', label: 'Reports', icon: ChartNoAxesCombined, roles: ['ADMIN'] },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true, state: null })
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [serviceState, setServiceState] = useState('checking')
  const allowed = navigation.filter((item) => item.roles.includes(user.role))

  useEffect(() => {
    let active = true
    let timer
    const checkDependencies = async () => {
      try {
        const result = await api.system.dependencies()
        if (active) {
          setServiceState(
            result.postgresql === 'available' && result.mongodb === 'available'
              ? 'healthy'
              : 'degraded',
          )
        }
      } catch {
        if (active) setServiceState('offline')
      }
      if (active) timer = window.setTimeout(checkDependencies, 60000)
    }
    checkDependencies()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  const serviceDisplay = {
    checking: { label: 'CHECKING', color: 'bg-slate-500', text: 'text-slate-400' },
    healthy: { label: 'SYSTEMS READY', color: 'bg-emerald-400', text: 'text-emerald-300' },
    degraded: { label: 'DEGRADED', color: 'bg-amber-400', text: 'text-amber-300' },
    offline: { label: 'API OFFLINE', color: 'bg-red-400', text: 'text-red-300' },
  }[serviceState]

  const SidebarContent = () => (
    <>
      <div className={`flex h-20 items-center border-b border-slate-700/70 ${collapsed ? 'justify-center px-3' : 'gap-3 px-5'}`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
          <Shield className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold tracking-[0.14em] text-white">CIMS</p>
            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-slate-500">SOC Console</p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary navigation">
        {!collapsed && <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Operations</p>}
        {allowed.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `group flex min-h-11 items-center rounded-lg border text-sm font-medium transition ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${isActive ? 'border-cyan-500/30 bg-cyan-400/10 text-cyan-200' : 'border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100'}`}
            title={collapsed ? label : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-700/70 p-3">
        <div className={`mb-2 rounded-lg border border-slate-700/70 bg-navy-900/80 ${collapsed ? 'p-2' : 'p-3'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500/15 text-sm font-bold text-blue-300">
              {user.name?.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{user.name}</p><p className="text-xs text-cyan-400">{user.role}</p></div>}
          </div>
        </div>
        <button type="button" onClick={handleLogout} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 ${collapsed ? 'justify-center' : 'gap-3'}`} title="Sign out">
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 overflow-x-hidden">
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex border-r border-slate-700/70 bg-navy-900 transition-all duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'w-20' : 'w-64'} lg:translate-x-0`}>
        <div className="flex w-full flex-col"><SidebarContent /></div>
        <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded p-2 text-slate-400 lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </aside>
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-700/60 bg-navy-950/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <button type="button" className="hidden rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white lg:block" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><ChevronLeft className={`h-5 w-5 transition ${collapsed ? 'rotate-180' : ''}`} /></button>
            <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><FileText className="h-4 w-4" /><span>{location.pathname === '/dashboard' ? 'Operational overview' : 'Security operations'}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle showLabel />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">API</span>
              <span className={`h-2 w-2 rounded-full ${serviceDisplay.color}`} />
              <span className={`font-mono ${serviceDisplay.text}`}>{serviceDisplay.label}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1600px] min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
