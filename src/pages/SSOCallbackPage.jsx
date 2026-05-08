import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { authAPI } from '@/api/api'

// Handles cross-domain SSO: /auth/sso?token=XXX
// Verifies the short-lived token, stores the session JWT, then goes to /admin.
export default function SSOCallbackPage() {
  const navigate = useNavigate()
  const { loginWithOAuth } = useAuth()

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { navigate('/login', { replace: true }); return }

    authAPI.verifySSOToken(token)
      .then(({ data }) => {
        localStorage.setItem('token', data.token)
        loginWithOAuth(data.user, data.token)
        navigate('/admin', { replace: true })
      })
      .catch(() => navigate('/login?error=sso_failed', { replace: true }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
