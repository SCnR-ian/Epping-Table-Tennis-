import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { socialAPI } from '@/api/api'
import SocialPlayCard from '@/components/common/SocialPlayCard'

export default function SocialPlayPage() {
  const { isAuthenticated, user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetchSessions = () =>
    socialAPI.getSessions()
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => { fetchSessions() }, [])

  const handleJoin = async (id) => {
    if (!isAuthenticated) { window.location.href = '/login'; return }
    try {
      await socialAPI.join(id)
      await fetchSessions()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not join session.')
    }
  }

  const handleLeave = async (id) => {
    try {
      await socialAPI.leave(id)
      await fetchSessions()
    } catch {
      alert('Could not leave session.')
    }
  }

  return (
    <div className="page-wrapper py-10 px-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">Join &amp; Play</p>
        <h1 className="font-display text-5xl md:text-6xl text-white tracking-wider mb-3">Social Play</h1>
        <p className="text-slate-400 max-w-xl">
          Drop-in sessions open to all members — come along, meet other players,
          and enjoy some casual table tennis.
        </p>
      </div>

      {!isAuthenticated && (
        <div className="mb-8 p-4 rounded-lg bg-brand-500/10 border border-brand-500/20 text-sm text-brand-300">
          <a href="/login" className="underline font-medium">Log in</a> to join a session and see who else is coming.
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-5xl mb-4">🏓</p>
          <p className="text-lg">No upcoming social play sessions.</p>
          <p className="text-xs mt-2 text-slate-600">Check back later — an admin will schedule the next one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map(s => (
            <SocialPlayCard
              key={s.id}
              session={{ ...s, joined_user_id: user?.id }}
              isAuthenticated={isAuthenticated}
              onJoin={() => handleJoin(s.id)}
              onLeave={() => handleLeave(s.id)}
            />
          ))}
        </div>
      )}

    </div>
  )
}
