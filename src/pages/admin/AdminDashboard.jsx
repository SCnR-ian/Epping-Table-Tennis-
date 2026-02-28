import { useState, useEffect } from 'react'
import { adminAPI, bookingsAPI, coachingAPI } from '@/api/api'

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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
function countFreeAtSlot(bookings, sessions, slotTime) {
  const slotMins = toMins(slotTime)
  const busyIds = new Set([
    ...bookings
      .filter(b => {
        const start = toMins(b.start_time)
        const end   = toMins(b.end_time)
        return slotMins >= start && slotMins < end
      })
      .map(b => b.court_id),
    ...sessions
      .filter(s => {
        const start = toMins(s.start_time)
        const end   = toMins(s.end_time)
        return slotMins >= start && slotMins < end
      })
      .map(s => s.court_id),
  ])
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

// Get all coaching sessions in progress during a given time slot.
function getCoachingAtSlot(sessions, slotTime) {
  const slotMins = toMins(slotTime)
  return sessions.filter(s => {
    const start = toMins(s.start_time)
    const end   = toMins(s.end_time)
    return slotMins >= start && slotMins < end
  })
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'members',     label: 'Total Members',     icon: '👥', color: 'text-sky-400'     },
  { key: 'bookings',    label: 'Active Bookings',    icon: '📅', color: 'text-emerald-400' },
  { key: 'tournaments', label: 'Active Tournaments', icon: '🏆', color: 'text-yellow-400'  },
]

const TABS = ['Members', 'Bookings', 'Coaching']

const BOOKABLE_COURTS = [
  { id: 1, label: 'Court 1' },
  { id: 2, label: 'Court 2' },
  { id: 3, label: 'Court 3' },
  { id: 4, label: 'Court 4' },
  { id: 5, label: 'Court 5' },
  { id: 6, label: 'Court 6' },
]

const WEEKDAY_SLOTS  = ['15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00']
const SATURDAY_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30']

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
  const [bookings,           setBookings]           = useState([])
  const [bookingViewSessions, setBookingViewSessions] = useState([])
  const [memberSearch,       setMemberSearch]       = useState('')
  const [loading,      setLoading]      = useState(false)

  // Coaching state
  const [coaches,          setCoaches]          = useState([])
  const [coachingSessions, setCoachingSessions] = useState([])
  const [coachingDate,     setCoachingDate]     = useState(() => {
    const dates = getUpcomingOpenDates(1)
    return dates.length ? toISO(dates[0]) : ''
  })
  const [newCoachName,     setNewCoachName]     = useState('')
  const [newCoachBio,      setNewCoachBio]      = useState('')
  const [newCoachUserId,   setNewCoachUserId]   = useState('')
  const [showSessionForm,  setShowSessionForm]  = useState(false)
  const [sessionForm,      setSessionForm]      = useState({
    coach_id: '', student_id: '', court_id: '',
    date: '', start_time: '', end_time: '', notes: '', weeks: 1,
  })

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

  // Fetch bookings + coaching sessions for the selected date when Bookings tab is active
  useEffect(() => {
    if (activeTab !== 'Bookings' || !selectedDate) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      adminAPI.getAllBookings({ date: selectedDate }),
      coachingAPI.getSessions({ date: selectedDate }),
    ])
      .then(([{ data: bd }, { data: cd }]) => {
        if (!cancelled) {
          setBookings(bd.bookings)
          setBookingViewSessions(cd.sessions)
        }
      })
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

  // Fetch coaches + sessions when Coaching tab is active
  useEffect(() => {
    if (activeTab !== 'Coaching') return
    let cancelled = false
    setLoading(true)
    const membersFetch = members.length === 0
      ? adminAPI.getAllMembers()
      : Promise.resolve({ data: { members } })
    Promise.all([
      coachingAPI.getCoaches(),
      coachingAPI.getSessions({ date: coachingDate }),
      membersFetch,
    ])
      .then(([{ data: cd }, { data: sd }, { data: md }]) => {
        if (!cancelled) {
          setCoaches(cd.coaches)
          setCoachingSessions(sd.sessions)
          if (members.length === 0) setMembers(md.members)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, coachingDate])

  const handleAddCoach = async () => {
    if (!newCoachName.trim()) return
    try {
      const payload = { name: newCoachName, bio: newCoachBio }
      if (newCoachUserId) payload.user_id = Number(newCoachUserId)
      const { data } = await coachingAPI.createCoach(payload)
      setCoaches(prev => [...prev, data.coach])
      setNewCoachName('')
      setNewCoachBio('')
      setNewCoachUserId('')
      // Refresh members so the role change is reflected
      if (newCoachUserId) {
        const { data: md } = await adminAPI.getAllMembers()
        setMembers(md.members)
      }
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add coach.')
    }
  }

  const handleDeleteCoach = async (id) => {
    if (!window.confirm('Delete this coach?')) return
    try {
      await coachingAPI.deleteCoach(id)
      setCoaches(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not delete coach.')
    }
  }

  const handleCreateSession = async () => {
    try {
      await coachingAPI.createSession(sessionForm)
      setShowSessionForm(false)
      setSessionForm({ coach_id: '', student_id: '', court_id: '', date: '', start_time: '', end_time: '', notes: '', weeks: 1 })
      const { data } = await coachingAPI.getSessions({ date: coachingDate })
      setCoachingSessions(data.sessions)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not schedule session.')
    }
  }

  const handleCancelSession = async (id) => {
    if (!window.confirm('Cancel this coaching session?')) return
    try {
      await coachingAPI.cancelSession(id)
      setCoachingSessions(prev => prev.filter(s => s.id !== id))
      setBookingViewSessions(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('Could not cancel session.')
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

          {/* Member search */}
          <div className="mb-5">
            <input
              type="text"
              className="input w-full max-w-xs"
              placeholder="Search member name…"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
            />
          </div>

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
                    const free          = countFreeAtSlot(bookings, bookingViewSessions, slot)
                    const total         = BOOKABLE_COURTS.length
                    const search        = memberSearch.toLowerCase().trim()
                    const slotBookings  = getBookingsAtSlot(bookings, slot)
                      .filter(b => !search || b.user_name.toLowerCase().includes(search))
                    const slotSessions  = getCoachingAtSlot(bookingViewSessions, slot)
                      .filter(s => !search || s.student_name.toLowerCase().includes(search))
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
                          {slotBookings.length === 0 && slotSessions.length === 0 ? (
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
                              {slotSessions.map(s => (
                                <div key={`cs-${s.id}`} className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-3">
                                  <div>
                                    <p className="text-emerald-400 font-semibold text-xs">{s.student_name}</p>
                                    <p className="text-slate-500 text-[10px]">Coach: {s.coach_name}</p>
                                    <p className="text-slate-500 text-[10px]">
                                      {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleCancelSession(s.id)}
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
      {/* ── Coaching tab ─────────────────────────────────────────────────── */}
      {activeTab === 'Coaching' && (
        <div className="animate-fade-in space-y-10">

          {/* ── Coaches section ── */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Coaches</h2>

            {/* Add coach form */}
            <div className="card mb-4 space-y-3">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Add Coach</p>
              <input
                className="input w-full"
                placeholder="Name"
                value={newCoachName}
                onChange={e => setNewCoachName(e.target.value)}
              />
              <textarea
                className="input w-full h-20 resize-none"
                placeholder="Bio (optional)"
                value={newCoachBio}
                onChange={e => setNewCoachBio(e.target.value)}
              />
              <div>
                <label className="block text-xs text-slate-400 mb-1">Link to Member Account (optional)</label>
                <select
                  className="input w-full"
                  value={newCoachUserId}
                  onChange={e => setNewCoachUserId(e.target.value)}
                >
                  <option value="">No linked account</option>
                  {members.filter(m => m.role !== 'coach').map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">Linked member will have their role set to "coach" and can see their schedule on the dashboard.</p>
              </div>
              <button onClick={handleAddCoach} className="btn-primary text-sm">
                Add Coach
              </button>
            </div>

            {/* Coaches list */}
            {loading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : coaches.length === 0 ? (
              <p className="text-slate-500 text-sm">No coaches yet.</p>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-court-light">
                      {['Name', 'Bio', 'Linked Account', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coaches.map(c => (
                      <tr key={c.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                        <td className="px-5 py-3 text-slate-400 text-xs max-w-xs truncate">{c.bio ?? '—'}</td>
                        <td className="px-5 py-3 text-xs">
                          {c.user_id
                            ? (() => {
                                const u = members.find(m => m.id === c.user_id)
                                return u
                                  ? <span className="text-sky-400">{u.name}</span>
                                  : <span className="text-slate-500">ID {c.user_id}</span>
                              })()
                            : <span className="text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => handleDeleteCoach(c.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Sessions section ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Coaching Sessions</h2>
              <button
                onClick={() => setShowSessionForm(v => !v)}
                className="btn-primary text-sm"
              >
                {showSessionForm ? 'Cancel' : '+ Schedule Session'}
              </button>
            </div>

            {/* Schedule session form */}
            {showSessionForm && (
              <div className="card mb-6 space-y-4">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">New Coaching Session</p>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Coach</label>
                  <select className="input w-full" value={sessionForm.coach_id}
                    onChange={e => setSessionForm(f => ({ ...f, coach_id: e.target.value }))}>
                    <option value="">Select coach…</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Student (Member)</label>
                  <select className="input w-full" value={sessionForm.student_id}
                    onChange={e => setSessionForm(f => ({ ...f, student_id: e.target.value }))}>
                    <option value="">Select student…</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Court</label>
                  <select className="input w-full" value={sessionForm.court_id}
                    onChange={e => setSessionForm(f => ({ ...f, court_id: e.target.value }))}>
                    <option value="">Select court…</option>
                    {BOOKABLE_COURTS.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input type="date" className="input w-full" value={sessionForm.date}
                    onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">Start Time (HH:MM)</label>
                    <input type="text" className="input w-full" placeholder="e.g. 18:00" value={sessionForm.start_time}
                      onChange={e => setSessionForm(f => ({ ...f, start_time: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">End Time (HH:MM)</label>
                    <input type="text" className="input w-full" placeholder="e.g. 19:00" value={sessionForm.end_time}
                      onChange={e => setSessionForm(f => ({ ...f, end_time: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Recurring — generate for N weeks (1 = one-off)
                  </label>
                  <input type="number" min={1} max={52} className="input w-32"
                    value={sessionForm.weeks}
                    onChange={e => setSessionForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
                  <textarea className="input w-full h-20 resize-none"
                    placeholder="e.g. Focus on backhand technique"
                    value={sessionForm.notes}
                    onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <button onClick={handleCreateSession} className="btn-primary text-sm">
                  Create Session{sessionForm.weeks > 1 ? ` (${sessionForm.weeks} weeks)` : ''}
                </button>
              </div>
            )}

            {/* Date picker */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {upcomingDates.map(d => {
                const iso      = toISO(d)
                const dowLabel = d.toLocaleDateString('en-AU', { weekday: 'short' })
                const dayLabel = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                return (
                  <button key={iso} onClick={() => setCoachingDate(iso)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all text-center min-w-[72px] ${
                      coachingDate === iso
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

            {/* Sessions table */}
            {loading ? (
              <p className="text-slate-500 text-sm">Loading sessions…</p>
            ) : coachingSessions.length === 0 ? (
              <p className="text-slate-500 text-sm">No coaching sessions on this date.</p>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-court-light">
                      {['Student', 'Coach', 'Court', 'Time', 'Notes', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-slate-500 uppercase tracking-wider font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coachingSessions.map(s => (
                      <tr key={s.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-white">{s.student_name}</p>
                          <p className="text-slate-500 text-xs">{s.student_email}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-300">{s.coach_name}</td>
                        <td className="px-5 py-3 text-slate-300">{s.court_name}</td>
                        <td className="px-5 py-3 text-slate-400 text-xs font-mono whitespace-nowrap">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs max-w-[160px] truncate">
                          {s.notes ?? '—'}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => handleCancelSession(s.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
