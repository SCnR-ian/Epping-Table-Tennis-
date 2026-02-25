import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import BookingCard from '@/components/common/BookingCard'
import TournamentCard from '@/components/common/TournamentCard'
import { bookingsAPI } from '@/api/api'

const MOCK_TOURNAMENTS = [
  { id: 1, name: 'Summer Singles Cup', date: '2025-03-15', prize: '$500', status: 'open', participants: 18, maxParticipants: 32, format: 'Singles' },
]

function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function mapBooking(b) {
  return {
    id:      b.id,
    groupId: b.booking_group_id,
    court:   b.court_name,
    date:    b.date,
    time:    fmtTime(b.start_time),
    duration: toMins(b.end_time) - toMins(b.start_time),
    status:  b.status ?? 'confirmed',
  }
}

const QUICK_STATS = [
  { key: 'games',        label: 'Games Played',  icon: '🏓' },
  { key: 'wins',         label: 'Wins',           icon: '🏆' },
  { key: 'tournaments',  label: 'Tournaments',    icon: '🥇' },
  { key: 'hours',        label: 'Hours on Court', icon: '⏱️' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const [bookings,     setBookings]     = useState([])
  const [tournaments,  setTournaments]  = useState(MOCK_TOURNAMENTS)
  const [stats,        setStats]        = useState({ games: 42, wins: 28, tournaments: 5, hours: 64 })
  const [loadingData,  setLoadingData]  = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingData(true)
    bookingsAPI.getMyBookings()
      .then(({ data }) => { if (!cancelled) setBookings(data.bookings.map(mapBooking)) })
      .catch(() => { if (!cancelled) setBookings([]) })
      .finally(() => { if (!cancelled) setLoadingData(false) })
    return () => { cancelled = true }
  }, [])

  const handleExtend = async (id, extraMins) => {
    const booking = bookings.find(b => b.id === id)
    if (!booking?.groupId) return
    await bookingsAPI.extendGroup(booking.groupId, extraMins)
    const { data } = await bookingsAPI.getMyBookings()
    setBookings(data.bookings.map(mapBooking))
  }

  const handleCancel = async (id) => {
    const booking = bookings.find(b => b.id === id)
    try {
      if (booking?.groupId) {
        await bookingsAPI.cancelGroup(booking.groupId)
        setBookings(prev => prev.filter(b => b.groupId !== booking.groupId))
      } else {
        await bookingsAPI.cancel(id)
        setBookings(prev => prev.filter(b => b.id !== id))
      }
    } catch {
      alert('Could not cancel booking. Please try again.')
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="page-wrapper py-8 px-4 max-w-7xl mx-auto space-y-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">{greeting()},</p>
          <h1 className="font-display text-4xl text-white tracking-wider">{user?.name ?? 'Player'}</h1>
        </div>
        <Link to="/booking" className="btn-primary">
          + Book a Court
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_STATS.map(({ key, label, icon }) => (
          <div key={key} className="card text-center">
            <span className="text-2xl">{icon}</span>
            <p className="font-display text-4xl text-brand-500 tracking-wider mt-2">
              {loadingData ? '—' : stats[key]}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Recent Bookings */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Bookings</h2>
            <Link to="/booking" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <div className="space-y-3">
            {bookings.length === 0
              ? <p className="text-slate-500 text-sm">No bookings yet.</p>
              : bookings.map(b => <BookingCard key={b.id} booking={b} onCancel={handleCancel} onExtend={handleExtend} />)
            }
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Tournaments */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Tournaments</h2>
              <Link to="/tournaments" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
            </div>
            <div className="space-y-3">
              {tournaments.map(t => <TournamentCard key={t.id} tournament={t} />)}
            </div>
          </div>

          {/* Quick links */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Quick Links</h3>
            <nav className="space-y-1">
              {[
                ['Profile Settings', '/profile'],
                ['Book a Court',     '/booking'],
                ['All Tournaments',  '/tournaments'],
              ].map(([label, to]) => (
                <Link key={to} to={to} className="flex items-center justify-between py-2 text-sm text-slate-400 hover:text-white border-b border-court-light last:border-0 transition-colors">
                  {label}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  )
}
