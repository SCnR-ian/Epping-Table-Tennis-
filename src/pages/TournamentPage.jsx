import { useState } from 'react'
import TournamentCard from '@/components/common/TournamentCard'
import { useAuth } from '@/context/AuthContext'

const ALL_TOURNAMENTS = [
  { id: 1, name: 'Summer Singles Cup',       date: '2025-03-15', prize: '$500', status: 'open',      participants: 18, maxParticipants: 32, format: 'Singles' },
  { id: 2, name: 'Doubles Invitational',      date: '2025-04-05', prize: '$300', status: 'open',      participants: 6,  maxParticipants: 16, format: 'Doubles' },
  { id: 3, name: 'Junior Championship',       date: '2025-04-20', prize: '$200', status: 'upcoming',  participants: 0,  maxParticipants: 16, format: 'Singles' },
  { id: 4, name: 'Club Championship 2025',    date: '2025-05-10', prize: '$800', status: 'upcoming',  participants: 0,  maxParticipants: 32, format: 'Singles' },
  { id: 5, name: 'February Open Singles',     date: '2025-02-10', prize: '$400', status: 'completed', participants: 28, maxParticipants: 32, format: 'Singles' },
  { id: 6, name: 'Summer Doubles League',     date: '2025-01-20', prize: '$250', status: 'completed', participants: 16, maxParticipants: 16, format: 'Doubles' },
]

const FILTERS = ['All', 'Open', 'Upcoming', 'Completed']

export default function TournamentPage() {
  const { isAuthenticated } = useAuth()
  const [filter, setFilter] = useState('All')
  const [registered, setRegistered] = useState(new Set())

  const filtered = filter === 'All'
    ? ALL_TOURNAMENTS
    : ALL_TOURNAMENTS.filter(t => t.status === filter.toLowerCase())

  const handleRegister = async (id) => {
    if (!isAuthenticated) { window.location.href = '/login'; return }
    // await tournamentsAPI.register(id)
    setRegistered(r => new Set([...r, id]))
  }

  return (
    <div className="page-wrapper py-10 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">Compete & Win</p>
        <h1 className="font-display text-5xl md:text-6xl text-white tracking-wider mb-3">Tournaments</h1>
        <p className="text-slate-400 max-w-xl">
          From beginner-friendly opens to club championships — there's a level for everyone. Register early, spots fill fast.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === f
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-5xl mb-4">🏓</p>
          <p>No tournaments found for this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(t => (
            <TournamentCard
              key={t.id}
              tournament={{ ...t, registered: registered.has(t.id) }}
              onRegister={!registered.has(t.id) ? handleRegister : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
