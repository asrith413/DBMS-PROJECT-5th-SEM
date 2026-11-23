import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { LoadingState } from '../common/States'

export default function ProtectedRoute({ children, roles }) {
  const { user, loading, isAuthenticated } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen bg-navy-950"><LoadingState label="Validating secure session…" /></div>
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}
