import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ClubProvider } from '@/context/ClubContext'
import { EditModeProvider } from '@/context/EditModeContext'
import { CartProvider } from '@/context/CartContext'
import EditModeToggle from '@/components/cms/EditModeToggle'
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
import FinanceReportPage   from '@/pages/admin/FinanceReportPage'
import CoachingPage        from '@/pages/CoachingPage'
import NotFoundPage        from '@/pages/NotFoundPage'
import OAuthCallbackPage   from '@/pages/OAuthCallbackPage'
import ScanPage            from '@/pages/ScanPage'
import NewsPage            from '@/pages/NewsPage'
import NewsDetailPage      from '@/pages/NewsDetailPage'
import ShoppingPage        from '@/pages/ShoppingPage'
import ProductDetailPage   from '@/pages/ProductDetailPage'
import CartPage            from '@/pages/CartPage'
import CheckoutPage           from '@/pages/CheckoutPage'
import ForgotPasswordPage    from '@/pages/ForgotPasswordPage'
import ResetPasswordPage     from '@/pages/ResetPasswordPage'
import LandingPage              from '@/pages/LandingPage'
import OnboardingPage           from '@/pages/OnboardingPage'
import PlatformDashboardPage    from '@/pages/PlatformDashboardPage'
import SSOCallbackPage          from '@/pages/SSOCallbackPage'

// Show landing page when running on the platform root (flinther.com) with no club subdomain
const hostname  = window.location.hostname
const subdomain = import.meta.env.VITE_CLUB_SUBDOMAIN ||
  (hostname.endsWith('.flinther.com') ? hostname.replace('.flinther.com', '') : null)
const isLanding = !subdomain || subdomain === 'www'

const router = createBrowserRouter(isLanding ? [
  { path: '/',                element: <LandingPage /> },
  { path: '/login',           element: <LoginPage /> },
  { path: '/register',        element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password',  element: <ResetPasswordPage /> },
  { path: '/auth/callback',   element: <OAuthCallbackPage /> },
  { path: '/onboarding',      element: <ProtectedRoute><OnboardingPage /></ProtectedRoute> },
  { path: '/dashboard',       element: <ProtectedRoute><PlatformDashboardPage /></ProtectedRoute> },
  { path: '*',                element: <LandingPage /> },
] : [
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
      { path: '/auth/sso',      element: <SSOCallbackPage /> },
      { path: '/news',           element: <NewsPage /> },
      { path: '/news/:id',       element: <NewsDetailPage /> },
      { path: '/shopping',      element: <ShoppingPage /> },
      { path: '/shopping/:id',  element: <ProductDetailPage /> },
      { path: '/bag',           element: <CartPage /> },
      { path: '/checkout',         element: <CheckoutPage /> },
      { path: '/forgot-password',  element: <ForgotPasswordPage /> },
      { path: '/reset-password',   element: <ResetPasswordPage /> },
      {
        path: '/scan',
        element: <ProtectedRoute><ScanPage /></ProtectedRoute>,
      },

      // ── Protected routes (must be authenticated) ─────────────
      {
        path: '/dashboard',
        element: <ProtectedRoute><DashboardPage /></ProtectedRoute>,
      },
      {
        path: '/profile',
        element: <ProtectedRoute><ProfilePage /></ProtectedRoute>,
      },
      // ── Admin-only routes ─────────────────────────────────────
      {
        path: '/admin',
        element: <AdminRoute><AdminDashboard /></AdminRoute>,
      },
      {
        path: '/admin/finance',
        element: <AdminRoute><FinanceReportPage /></AdminRoute>,
      },

      // ── Onboarding (new club registration) ───────────────────
      {
        path: '/onboarding',
        element: <ProtectedRoute><OnboardingPage /></ProtectedRoute>,
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
        <CartProvider>
          <EditModeProvider>
            <RouterProvider router={router} />
            <EditModeToggle />
          </EditModeProvider>
        </CartProvider>
      </AuthProvider>
    </ClubProvider>
  )
}
