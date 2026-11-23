import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/layout/ProtectedRoute'
import { LoadingState } from './components/common/States'
import { useAuth } from './context/AuthContext'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'))
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage'))
const SecurityLogsPage = lazy(() => import('./pages/SecurityLogsPage'))
const AnalystsPage = lazy(() => import('./pages/AnalystsPage'))
const AssetsPage = lazy(() => import('./pages/AssetsPage'))
const ThreatActorsPage = lazy(() => import('./pages/ThreatActorsPage'))
const AuditPage = lazy(() => import('./pages/AuditPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PublicLogin() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
}

const guarded = (element, roles) => (
  <ProtectedRoute roles={roles}>{element}</ProtectedRoute>
)

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy-950"><LoadingState label="Loading SOC workspace…" /></div>}>
      <Routes>
        <Route path="/login" element={<PublicLogin />} />
        <Route path="/" element={guarded(<AppShell />)}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
          <Route path="security-logs" element={guarded(<SecurityLogsPage />, ['ADMIN', 'ANALYST'])} />
          <Route path="analysts" element={guarded(<AnalystsPage />, ['ADMIN'])} />
          <Route path="assets" element={guarded(<AssetsPage />, ['ADMIN', 'ANALYST'])} />
          <Route path="threat-actors" element={guarded(<ThreatActorsPage />, ['ADMIN', 'ANALYST'])} />
          <Route path="audit" element={guarded(<AuditPage />, ['ADMIN', 'ANALYST'])} />
          <Route path="reports" element={guarded(<ReportsPage />, ['ADMIN'])} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
