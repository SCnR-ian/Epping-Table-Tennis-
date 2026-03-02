import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { authAPI } from '@/api/api'

// The backend redirects here after OAuth: /auth/callback?token=xxx
export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { loginWithOAuth } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true })
      return
    }

    // Store token so authAPI.me() can attach it as Bearer header
    localStorage.setItem('token', token)
    authAPI.me()
      .then(({ data }) => {
        loginWithOAuth(data.user, token)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        localStorage.removeItem('token')
        navigate('/login?error=oauth_failed', { replace: true })
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-court-dark">
      <div className="text-center">
        <svg className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-slate-400 text-sm">Completing sign in…</p>
      </div>
    </div>
  )
}
