import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { clubAPI } from '@/api/api'

const PAGES_HOST = 'flinther.com'

export default function PlatformDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(undefined)

  useEffect(() => {
    clubAPI.getMine()
      .then(r => setClub(r.data.club))
      .catch(() => setClub(null))
  }, [])

  const adminUrl = club ? `https://${club.subdomain}.${PAGES_HOST}/admin` : null
  const [copied, setCopied] = useState(false)
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(adminUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [adminUrl])

  return (
    <div
      className="min-h-screen bg-white flex flex-col items-center justify-center px-4"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      <div className="w-full max-w-[400px]">

        <div className="flex justify-center mb-6">
          <div
            className="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xl"
            style={{ fontFamily: '"Kanit", sans-serif' }}
          >
            F
          </div>
        </div>

        <h1
          className="text-2xl text-gray-900 text-center mb-1"
          style={{ fontFamily: '"Kanit", sans-serif' }}
        >
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          Manage your club from here.
        </p>

        {club === undefined && (
          <div className="text-center text-gray-400 text-sm">Loading…</div>
        )}

        {club === null && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-center">
              You don't have a club yet.
            </p>
            <button
              onClick={() => navigate('/onboarding')}
              className="w-full bg-[#4b6bfb] hover:bg-[#3a5af0] text-white rounded-xl py-3 text-sm transition-colors"
            >
              Set up your club
            </button>
          </div>
        )}

        {club && (
          <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Your club</p>
              <p className="text-gray-900">{club.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{club.subdomain}.{PAGES_HOST}</p>
            </div>
            <a
              href={adminUrl}
              className="block w-full bg-[#4b6bfb] hover:bg-[#3a5af0] text-white rounded-xl py-3 text-sm text-center transition-colors"
            >
              Go to admin panel →
            </a>
            <button
              onClick={copyLink}
              className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        )}

        <button
          onClick={logout}
          className="w-full mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Log out
        </button>

      </div>
    </div>
  )
}
