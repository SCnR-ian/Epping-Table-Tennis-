import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

// Spinner shown while auth state is resolving
const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-10 h-10 border-4 border-court-light border-t-brand-500 rounded-full animate-spin" />
  </div>
)

// ---------------------------------------------------------------------------
// ProtectedRoute – requires authentication
// ---------------------------------------------------------------------------
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

// ---------------------------------------------------------------------------
// AdminRoute – requires admin role
// ---------------------------------------------------------------------------
export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading)           return <Spinner />
  if (!isAuthenticated)  return <Navigate to="/login"     state={{ from: location }} replace />
  if (!isAdmin)          return <Navigate to="/dashboard" replace />
  return children
}
