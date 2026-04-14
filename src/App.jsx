import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ClubProvider } from '@/context/ClubContext'
import { ProtectedRoute, AdminRoute } from '@/routes/ProtectedRoute'
import RootLayout          from '@/components/layout/RootLayout'
import HomePage            from '@/pages/HomePage'
import AboutUsPage         from '@/pages/AboutUsPage'
import TrainingProgramPage from '@/pages/TrainingProgramPage'
import PlayPage            from '@/pages/PlayPage'
import LoginPage           from '@/pages/LoginPage'
import RegisterPage        from '@/pages/RegisterPage'
import DashboardPage       from '@/pages/DashboardPage'
import BookingPage         from '@/pages/BookingPage'
import SocialPlayPage      from '@/pages/SocialPlayPage'
import ProfilePage         from '@/pages/ProfilePage'
import AdminDashboard      from '@/pages/admin/AdminDashboard'
import CoachingPage        from '@/pages/CoachingPage'
import NotFoundPage        from '@/pages/NotFoundPage'
import OAuthCallbackPage   from '@/pages/OAuthCallbackPage'
import MessagesPage        from '@/pages/MessagesPage'

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // ── Public routes ────────────────────────────────────────
      { path: '/',              element: <HomePage /> },
      { path: '/about',         element: <AboutUsPage /> },
      { path: '/training',      element: <TrainingProgramPage /> },
      { path: '/play',          element: <PlayPage /> },
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
      {
        path: '/messages',
        element: <ProtectedRoute><MessagesPage /></ProtectedRoute>,
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
    <ClubProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ClubProvider>
  )
}
