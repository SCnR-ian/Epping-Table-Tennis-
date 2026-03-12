import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { socialAPI } from '@/api/api'
import SocialPlayCard from '@/components/common/SocialPlayCard'

const PAGE_SIZE = 3

export default function SocialPlayPage() {
  const { isAuthenticated, user } = useAuth()
  const [sessions,      setSessions]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [page,          setPage]          = useState(0)
  const [selectedDate,  setSelectedDate]  = useState('')

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

  // Sort: upcoming first (chronological), past sessions at the end
  const sorted = useMemo(() => {
    const now = Date.now()
    const isPast = s => new Date(`${s.date}T${s.end_time}`) < now
    return [...sessions].sort((a, b) => {
      const aPast = isPast(a), bPast = isPast(b)
      if (aPast !== bPast) return aPast ? 1 : -1
      return new Date(`${a.date}T${a.start_time}`) - new Date(`${b.date}T${b.start_time}`)
    })
  }, [sessions])

  const filtered    = selectedDate ? sorted.filter(s => s.date?.slice(0, 10) === selectedDate) : sorted
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSlice   = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="page-wrapper py-10 px-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">Join &amp; Play</p>
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

      {/* Date filter */}
      {!loading && sorted.length > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <label className="text-sm text-slate-400">Filter by date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setPage(0) }}
            className="input text-sm px-3 py-1.5"
          />
          {selectedDate && (
            <button
              onClick={() => { setSelectedDate(''); setPage(0) }}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Loading sessions…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-5xl mb-4">🏓</p>
          <p className="text-lg">{selectedDate ? 'No sessions on this date.' : 'No upcoming social play sessions.'}</p>
          {!selectedDate && <p className="text-sm mt-2 text-slate-600">Check back later — an admin will schedule the next one.</p>}
        </div>
      ) : (
        <div>
          {/* Cards row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pageSlice.map(s => {
              const isPast = new Date(`${s.date}T${s.end_time}`) < new Date()
              return (
                <SocialPlayCard
                  key={s.id}
                  session={{ ...s, joined_user_id: user?.id }}
                  isAuthenticated={isAuthenticated}
                  isPast={isPast}
                  onJoin={() => handleJoin(s.id)}
                  onLeave={() => handleLeave(s.id)}
                />
              )
            })}
          </div>

          {/* Navigation */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-court-light text-slate-300 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <span className="text-sm text-slate-400">
                {page + 1} / {totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-court-light text-slate-300 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
