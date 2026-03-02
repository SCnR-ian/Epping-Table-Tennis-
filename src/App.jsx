import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute, AdminRoute } from '@/routes/ProtectedRoute'
import RootLayout        from '@/components/layout/RootLayout'
import HomePage          from '@/pages/HomePage'
import LoginPage         from '@/pages/LoginPage'
import RegisterPage      from '@/pages/RegisterPage'
import DashboardPage     from '@/pages/DashboardPage'
import BookingPage       from '@/pages/BookingPage'
import SocialPlayPage    from '@/pages/SocialPlayPage'
import ProfilePage       from '@/pages/ProfilePage'
import AdminDashboard    from '@/pages/admin/AdminDashboard'
import CoachingPage      from '@/pages/CoachingPage'
import NotFoundPage      from '@/pages/NotFoundPage'
import OAuthCallbackPage from '@/pages/OAuthCallbackPage'

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // ── Public routes ────────────────────────────────────────
      { path: '/',              element: <HomePage /> },
      { path: '/login',         element: <LoginPage /> },
      { path: '/register',      element: <RegisterPage /> },
      { path: '/social-play',   element: <SocialPlayPage /> },
      { path: '/booking',       element: <BookingPage /> },
      { path: '/coaching',      element: <CoachingPage /> },
      { path: '/auth/callback', element: <OAuthCallbackPage /> },

      // ── Protected routes (must be authenticated) ─────────────
      {
        path: '/dashboard',
        element: <ProtectedRoute><DashboardPage /></ProtectedRoute>,
      },
      {
        path: '/profile',
        element: <ProtectedRoute><ProfilePage /></ProtectedRoute>,
      },

      // ── Admin-only route ──────────────────────────────────────
      {
        path: '/admin',
        element: <AdminRoute><AdminDashboard /></AdminRoute>,
      },

      // ── 404 ──────────────────────────────────────────────────
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
