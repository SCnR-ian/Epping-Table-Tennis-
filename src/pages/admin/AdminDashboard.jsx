import { useState, useEffect } from 'react'
import { adminAPI, bookingsAPI } from '@/api/api'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

// Returns the next `count` dates that fall on opening days (Mon/Tue/Wed/Sat),
// starting from today.
function getUpcomingOpenDates(count = 7) {
  const OPEN_DOW = new Set([1, 2, 3, 6])
  const dates = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    if (OPEN_DOW.has(d.getDay())) dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

// Count how many of the 6 courts are free during a given time slot.
function countFreeAtSlot(bookings, slotTime) {
  const slotMins = toMins(slotTime)
  const busyIds = new Set(
    bookings
      .filter(b => {
        const start = toMins(b.start_time)
        const end   = toMins(b.end_time)
        return slotMins >= start && slotMins < end
      })
      .map(b => b.court_id)
  )
  return BOOKABLE_COURTS.length - busyIds.size
}

// Get all bookings that are in progress during a given time slot.
function getBookingsAtSlot(bookings, slotTime) {
  const slotMins = toMins(slotTime)
  return bookings.filter(b => {
    const start = toMins(b.start_time)
    const end   = toMins(b.end_time)
    return slotMins >= start && slotMins < end
  })
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'members',     label: 'Total Members',     icon: '👥', color: 'text-sky-400'     },
  { key: 'bookings',    label: 'Active Bookings',    icon: '📅', color: 'text-emerald-400' },
  { key: 'tournaments', label: 'Active Tournaments', icon: '🏆', color: 'text-yellow-400'  },
]

const TABS = ['Members', 'Bookings']

const BOOKABLE_COURTS = [
  { id: 1, label: 'Court 1' },
  { id: 2, label: 'Court 2' },
  { id: 3, label: 'Court 3' },
  { id: 4, label: 'Court 4' },
  { id: 5, label: 'Court 5' },
  { id: 6, label: 'Court 6' },
]

const WEEKDAY_SLOTS  = ['16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30']
const SATURDAY_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00']

const OPEN_DAYS = [
  { dow: 1, slots: WEEKDAY_SLOTS  },
  { dow: 2, slots: WEEKDAY_SLOTS  },
  { dow: 3, slots: WEEKDAY_SLOTS  },
  { dow: 6, slots: SATURDAY_SLOTS },
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activeTab,    setActiveTab]    = useState('Members')
  const [stats,        setStats]        = useState({ members: 0, bookings: 0, tournaments: 0 })
  const [members,      setMembers]      = useState([])
  const [bookings,     setBookings]     = useState([])
  const [loading,      setLoading]      = useState(false)

  // Default selected date = first upcoming open day
  const [selectedDate, setSelectedDate] = useState(() => {
    const dates = getUpcomingOpenDates(1)
    return dates.length ? toISO(dates[0]) : ''
  })

  const upcomingDates = getUpcomingOpenDates(7)

  // Derive time slots for the selected date
  const selectedDow = selectedDate ? new Date(selectedDate + 'T12:00:00').getDay() : null
  const slotsForDay = OPEN_DAYS.find(d => d.dow === selectedDow)?.slots ?? WEEKDAY_SLOTS

  // Fetch stats once on mount
  useEffect(() => {
    adminAPI.getDashboardStats()
      .then(({ data }) => setStats(data))
      .catch(() => {})
  }, [])

  // Fetch members when Members tab is active
  useEffect(() => {
    if (activeTab !== 'Members') return
    let cancelled = false
    setLoading(true)
    adminAPI.getAllMembers()
      .then(({ data }) => { if (!cancelled) setMembers(data.members) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab])

  // Fetch bookings for the selected date when Bookings tab is active
  useEffect(() => {
    if (activeTab !== 'Bookings' || !selectedDate) return
    let cancelled = false
    setLoading(true)
    adminAPI.getAllBookings({ date: selectedDate })
      .then(({ data }) => { if (!cancelled) setBookings(data.bookings) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, selectedDate])

  const handleRoleToggle = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin'
    try {
      await adminAPI.updateMemberRole(id, { role: newRole })
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m))
    } catch {
      alert('Could not update role. Please try again.')
    }
  }

  const handleRemoveMember = async (id) => {
    if (!window.confirm('Remove this member? This cannot be undone.')) return
    try {
      await adminAPI.deleteMember(id)
      setMembers(prev => prev.filter(m => m.id !== id))
      setStats(prev => ({ ...prev, members: Math.max(0, prev.members - 1) }))
    } catch {
      alert('Could not remove member. Please try again.')
    }
  }

  const handleCancelBooking = async (id) => {
    try {
      await bookingsAPI.cancel(id)
      setBookings(prev => prev.filter(b => b.id !== id))
      setStats(prev => ({ ...prev, bookings: Math.max(0, prev.bookings - 1) }))
    } catch {
      alert('Could not cancel booking. Please try again.')
    }
  }

  return (
    <div className="page-wrapper py-8 px-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-1">Admin Panel</p>
        <h1 className="font-display text-4xl text-white tracking-wider">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {STAT_CARDS.map(({ key, label, icon, color }) => (
          <div key={key} className="card">
            <span className="text-2xl">{icon}</span>
            <p className={`font-display text-4xl tracking-wider mt-2 ${color}`}>
              {stats[key] ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-court-light mb-6 gap-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Members tab ──────────────────────────────────────────────────── */}
      {activeTab === 'Members' && (
        <div className="card p-0 overflow-hidden animate-fade-in">
          {loading ? (
            <p className="text-slate-500 text-sm p-5">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-slate-500 text-sm p-5">No members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-court-light">
                    {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-white">{m.name}</td>
                      <td className="px-5 py-3 text-slate-400">{m.email}</td>
                      <td className="px-5 py-3">
                        <span className={`badge border ${m.role === 'admin'
                          ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                          : 'bg-court-light text-slate-400 border-court-light'}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{fmtDate(m.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleRoleToggle(m.id, m.role)}
                            className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                          >
                            {m.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bookings tab ─────────────────────────────────────────────────── */}
      {activeTab === 'Bookings' && (
        <div className="animate-fade-in">

          {/* Date selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            {upcomingDates.map(d => {
              const iso      = toISO(d)
              const dowLabel = d.toLocaleDateString('en-AU', { weekday: 'short' })
              const dayLabel = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all text-center min-w-[72px] ${
                    selectedDate === iso
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white'
                  }`}
                >
                  <div className="font-semibold">{dowLabel}</div>
                  <div className="text-xs opacity-80">{dayLabel}</div>
                </button>
              )
            })}
          </div>

          {/* Slot availability table */}
          <div className="card p-0 overflow-hidden">
            {loading ? (
              <p className="text-slate-500 text-sm p-5">Loading schedule…</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-court-light">
                    <th className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold w-28">Time</th>
                    <th className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold w-36">Tables Left</th>
                    <th className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {slotsForDay.map(slot => {
                    const free          = countFreeAtSlot(bookings, slot)
                    const total         = BOOKABLE_COURTS.length
                    const slotBookings  = getBookingsAtSlot(bookings, slot)
                    const full          = free === 0
                    const freeColor     = free === 0
                      ? 'text-red-400'
                      : free <= 2
                        ? 'text-yellow-400'
                        : 'text-emerald-400'

                    return (
                      <tr key={slot} className="border-b border-court-light/40 last:border-0">
                        <td className="px-5 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                          {fmtTime(slot)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-display text-lg font-bold ${freeColor}`}>{free}</span>
                            <span className="text-slate-600 text-xs">/ {total}</span>
                            {full && <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wide">Full</span>}
                          </div>
                        </td>
                        <td className="px-5 py-2">
                          {slotBookings.length === 0 ? (
                            <span className="text-xs text-slate-700">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {slotBookings.map(b => (
                                <div key={b.id} className="bg-brand-500/10 border border-brand-500/30 rounded-lg px-3 py-1.5 flex items-center gap-3">
                                  <div>
                                    <p className="text-brand-400 font-semibold text-xs">{b.user_name}</p>
                                    <p className="text-slate-500 text-[10px]">
                                      {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleCancelBooking(b.id)}
                                    className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
