import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { clubAPI, authAPI } from '@/api/api'

const PAGES_HOST = 'flinther.com'

export default function PlatformDashboardPage() {
  const { user, logout } = useAuth()

  useEffect(() => {
    clubAPI.getMine()
      .then(async r => {
        const club = r.data.club
        if (!club) return // no club → stay here (show "set up club" UI below)

        // Get a short-lived SSO token then redirect to the club's admin panel
        const { data } = await authAPI.getSSOToken()
        window.location.href = `https://${club.subdomain}.${PAGES_HOST}/auth/sso?token=${data.token}`
      })
      .catch(() => {})
  }, [user])

  return (
    <div
      className="min-h-screen bg-white flex flex-col items-center justify-center px-4"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      <div className="w-full max-w-[400px] text-center space-y-4">
        <div
          className="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xl mx-auto"
          style={{ fontFamily: '"Kanit", sans-serif' }}
        >
          F
        </div>
        <p className="text-gray-400 text-sm">Redirecting to your admin panel…</p>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
