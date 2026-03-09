import { useState, useEffect } from 'react'
import { adminAPI, bookingsAPI, coachingAPI, socialAPI, checkinAPI } from '@/api/api'

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
function countFreeAtSlot(bookings, sessions, socialSessions, slotTime) {
  const slotMins = toMins(slotTime)

  const inSlot = ({ start_time, end_time }) => {
    const start = toMins(start_time)
    const end   = toMins(end_time)
    return slotMins >= start && slotMins < end
  }

  // Regular bookings: Set of court_ids so the same court isn't double-counted
  // when multiple 30-min slot rows for the same booking pass the filter.
  const bookingCourts = new Set(bookings.filter(inSlot).map(b => b.court_id)).size

  // Coaching sessions: each session = 1 court, counted independently.
  // Do NOT merge into the booking Set — court numbers are auto-assigned and
  // a coaching session may share a court_id with a booking row by coincidence.
  const coachingCourts = sessions.filter(inSlot).length

  // Social play: count-based, no court IDs.
  const socialCourts = socialSessions
    .filter(inSlot)
    .reduce((sum, s) => sum + (s.num_courts ?? 0), 0)

  return Math.max(0, BOOKABLE_COURTS.length - bookingCourts - coachingCourts - socialCourts)
}

// Get social play sessions that are in progress during a given time slot.
function getSocialAtSlot(socialSessions, slotTime) {
  const slotMins = toMins(slotTime)
  return socialSessions.filter(s => {
    const start = toMins(s.start_time)
    const end   = toMins(s.end_time)
    return slotMins >= start && slotMins < end
  })
}

// Get bookings whose session STARTS at the given time slot.
// Each booking is now one grouped row spanning its full duration, so we
// only show it in the row where it begins (not in every overlapping slot).
function getBookingsAtSlot(bookings, slotTime) {
  const slotMins = toMins(slotTime)
  return bookings.filter(b => toMins(b.start_time) === slotMins)
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

// Group a flat session array into an ordered list of ISO-week buckets.
// Each bucket: { weekStart (ISO), sessions[], counted, total }
function groupByWeek(sessions) {
  const weeks = {}
  for (const s of sessions) {
    const d = new Date(s.date + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d)
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const key = toISO(mon)
    if (!weeks[key]) weeks[key] = { weekStart: key, sessions: [], counted: 0, total: 0 }
    weeks[key].sessions.push(s)
    weeks[key].total++
    if (s.counted) weeks[key].counted++
  }
  return Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'members',     label: 'Total Members',     icon: '👥', color: 'text-sky-400'     },
  { key: 'bookings',    label: 'Active Bookings',    icon: '📅', color: 'text-emerald-400' },
  { key: 'tournaments', label: 'Active Tournaments', icon: '🏆', color: 'text-yellow-400'  },
]

const TABS = ['Members', 'Bookings', 'Coaching', 'Social Play']

const BOOKABLE_COURTS = [
  { id: 1, label: 'Court 1' },
  { id: 2, label: 'Court 2' },
  { id: 3, label: 'Court 3' },
  { id: 4, label: 'Court 4' },
  { id: 5, label: 'Court 5' },
  { id: 6, label: 'Court 6' },
]

// Height in px of each 30-minute slot row in the calendar view.
const SLOT_H = 48

const WEEKDAY_SLOTS  = ['15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00']
const SATURDAY_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30']

const OPEN_DAYS = [
  { dow: 1, slots: WEEKDAY_SLOTS  },
  { dow: 2, slots: WEEKDAY_SLOTS  },
  { dow: 3, slots: WEEKDAY_SLOTS  },
  { dow: 6, slots: SATURDAY_SLOTS },
]

// Assigns each event a lane (column index) so overlapping events don't cover
// each other. Returns the same array with `lane` and `totalLanes` added.
function layoutEvents(events) {
  const sorted = [...events].sort((a, b) => toMins(a.start_time) - toMins(b.start_time))
  const laneEnd = [] // laneEnd[i] = end-time (mins) of the last event placed in lane i
  const placed = sorted.map(ev => {
    const s = toMins(ev.start_time)
    let lane = laneEnd.findIndex(e => e <= s)
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(0) }
    laneEnd[lane] = toMins(ev.end_time)
    return { ...ev, lane }
  })
  const totalLanes = Math.max(laneEnd.length, 1)
  return placed.map(ev => ({ ...ev, totalLanes }))
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activeTab,    setActiveTab]    = useState('Members')
  const [stats,        setStats]        = useState({ members: 0, bookings: 0, tournaments: 0 })
  const [members,      setMembers]      = useState([])
  const [bookings,                setBookings]                = useState([])
  const [bookingViewSessions,     setBookingViewSessions]     = useState([])
  const [bookingViewSocialSessions, setBookingViewSocialSessions] = useState([])
  const [adminCheckIns,           setAdminCheckIns]           = useState([]) // { type, reference_id, user_id }
  const [memberSearch,       setMemberSearch]       = useState('')
  const [memberListSearch,   setMemberListSearch]   = useState('')
  const [loading,      setLoading]      = useState(false)

  // Today's per-coach session summary (shown in the header stat area)
  const [todayCoachSummary, setTodayCoachSummary] = useState([])

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
    coach_id: '', student_id: '',
    date: '', start_time: '', end_time: '', notes: '', weeks: 10,
  })
  const [studentSearch,    setStudentSearch]    = useState('')
  // Set of session IDs the admin has checked in during this tab visit
  const [adminCheckedIn,   setAdminCheckedIn]   = useState(new Set())
  const [showCoachesSection, setShowCoachesSection] = useState(false)
  const [showPayReport,      setShowPayReport]      = useState(false)

  // Pay period report state
  const [payFrom, setPayFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 13); return toISO(d)
  })
  const [payTo,      setPayTo]      = useState(() => toISO(new Date()))
  const [payReport,  setPayReport]  = useState(null)
  const [payLoading, setPayLoading] = useState(false)

  // Social Play state
  const [socialSessions,  setSocialSessions]  = useState([])
  const [showSocialForm,  setShowSocialForm]  = useState(false)
  const [socialForm,      setSocialForm]      = useState({
    title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12,
  })
  // { [sessionId]: { start_time: 'HH:MM', end_time: 'HH:MM' } } — open when admin is editing times
  const [editingTimes, setEditingTimes] = useState({})

  // Default selected date = first upcoming open day
  const [selectedDate, setSelectedDate] = useState(() => {
    const dates = getUpcomingOpenDates(1)
    return dates.length ? toISO(dates[0]) : ''
  })

  const upcomingDates = getUpcomingOpenDates(7)

  // Derive time slots for the selected date
  const selectedDow = selectedDate ? new Date(selectedDate + 'T12:00:00').getDay() : null
  const slotsForDay = OPEN_DAYS.find(d => d.dow === selectedDow)?.slots ?? WEEKDAY_SLOTS

  // Fetch stats + today's coaching sessions once on mount
  useEffect(() => {
    const today = toISO(new Date())
    Promise.allSettled([
      adminAPI.getDashboardStats(),
      coachingAPI.getSessions({ date: today }),
    ]).then(([statsRes, coachRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      if (coachRes.status === 'fulfilled') {
        const sessions = coachRes.value.data.sessions
        const byCoach = {}
        for (const s of sessions) {
          if (!byCoach[s.coach_id]) byCoach[s.coach_id] = { id: s.coach_id, name: s.coach_name, sessions: [] }
          byCoach[s.coach_id].sessions.push(s)
        }
        setTodayCoachSummary(Object.values(byCoach).sort((a, b) => a.name.localeCompare(b.name)))
      }
    }).catch(() => {})
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

  // Fetch bookings + coaching + social sessions for the selected date when Bookings tab is active
  useEffect(() => {
    if (activeTab !== 'Bookings' || !selectedDate) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      adminAPI.getAllBookings({ date: selectedDate }),
      coachingAPI.getSessions({ date: selectedDate }),
      socialAPI.getAdminSessions({ date: selectedDate }),
      checkinAPI.getByDate(selectedDate),
    ])
      .then(([{ data: bd }, { data: cd }, { data: sd }, { data: kid }]) => {
        if (!cancelled) {
          setBookings(bd.bookings)
          setBookingViewSessions(cd.sessions)
          setBookingViewSocialSessions(sd.sessions)
          setAdminCheckIns(kid.checkIns)
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

  const handleCancelBooking = async (bookingGroupId) => {
    try {
      await bookingsAPI.cancelGroup(bookingGroupId)
      setBookings(prev => prev.filter(b => b.booking_group_id !== bookingGroupId))
      setStats(prev => ({ ...prev, bookings: Math.max(0, prev.bookings - 1) }))
    } catch {
      alert('Could not cancel booking. Please try again.')
    }
  }

  const handleAdminCheckIn = async (type, refId, userId) => {
    try {
      if (type === 'booking')  await checkinAPI.adminCheckInBooking(refId, userId)
      if (type === 'coaching') await checkinAPI.adminCheckInCoaching(refId, userId)
      if (type === 'social')   await checkinAPI.adminCheckInSocial(refId, userId)
      setAdminCheckIns(prev => {
        const key = ci => ci.type === type && ci.reference_id === String(refId) && ci.user_id === userId
        if (prev.some(key)) return prev
        return [...prev, { type, reference_id: String(refId), user_id: userId }]
      })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not check in.')
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

  // Fetch social play sessions when Social Play tab is active
  useEffect(() => {
    if (activeTab !== 'Social Play') return
    let cancelled = false
    setLoading(true)
    socialAPI.getAdminSessions()
      .then(({ data }) => { if (!cancelled) setSocialSessions(data.sessions) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab])

  const handleCreateSocialSession = async () => {
    const { title, description, num_courts, date, start_time, end_time, max_players } = socialForm
    if (!date || !start_time || !end_time) {
      alert('Date, start time and end time are required.')
      return
    }
    try {
      const { data } = await socialAPI.createSession({
        title: title || 'Social Play',
        description: description || undefined,
        num_courts: Number(num_courts),
        date, start_time, end_time,
        max_players: Number(max_players) || 12,
      })
      setSocialSessions(prev => [...prev, data.session])
      setShowSocialForm(false)
      setSocialForm({ title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12 })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not create session.')
    }
  }

  const handleCancelSocialSession = async (id) => {
    if (!window.confirm('Cancel this social play session?')) return
    try {
      await socialAPI.cancelSession(id)
      setSocialSessions(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('Could not cancel session.')
    }
  }

  const handleCourtChange = async (id, delta) => {
    const session = socialSessions.find(s => s.id === id)
    if (!session) return
    const newCount = Math.min(Math.max(session.num_courts + delta, 1), 6)
    if (newCount === session.num_courts) return
    try {
      const { data } = await socialAPI.updateSession(id, { num_courts: newCount })
      setSocialSessions(prev => prev.map(s => s.id === id ? { ...s, ...data.session } : s))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update courts.')
    }
  }

  const handleSaveTime = async (id) => {
    const edits = editingTimes[id]
    if (!edits) return
    try {
      const { data } = await socialAPI.updateSession(id, {
        start_time: edits.start_time,
        end_time:   edits.end_time,
      })
      setSocialSessions(prev => prev.map(s => s.id === id ? { ...s, ...data.session } : s))
      setEditingTimes(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update time.')
    }
  }

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
      setSessionForm({ coach_id: '', student_id: '', date: '', start_time: '', end_time: '', notes: '', weeks: 1 })
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

  const handleAdminCheckInCoaching = async (sessionId, studentId) => {
    try {
      await checkinAPI.adminCheckInCoaching(sessionId, studentId)
      setAdminCheckedIn(prev => new Set([...prev, sessionId]))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not check in.')
    }
  }

  const handleLoadPayReport = async () => {
    setPayLoading(true)
    try {
      const { data } = await coachingAPI.getPaymentReport(payFrom, payTo)
      setPayReport(data.coaches)
    } catch {
      alert('Could not load payment report.')
    } finally {
      setPayLoading(false)
    }
  }

  return (
    <div className="page-wrapper py-8 px-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-brand-500 text-xs uppercase tracking-widest mb-1">Admin Panel</p>
        <h1 className="font-display text-4xl text-white tracking-wider">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {STAT_CARDS.map(({ key, label, icon, color }) => (
          <div key={key} className="card">
            <span className="text-2xl">{icon}</span>
            <p className={`font-display text-4xl tracking-wider mt-2 ${color}`}>
              {stats[key] ?? 0}
            </p>
            <p className="text-xs text-slate-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Today's coaching — per-coach session count with hover tooltip */}
      {todayCoachSummary.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-slate-300 uppercase tracking-widest mb-3">
            Today's Coaching
          </p>
          <div className="flex flex-wrap gap-3">
            {todayCoachSummary.map(coach => (
              <div key={coach.id} className="relative group">
                {/* Card */}
                <div className="card px-4 py-3 min-w-[110px] cursor-default select-none">
                  <p className="font-display text-3xl tracking-wider text-emerald-400">
                    {coach.sessions.length}
                  </p>
                  <p className="text-xs text-slate-200 mt-0.5 truncate max-w-[120px]">{coach.name}</p>
                  <p className="text-[10px] text-slate-400">
                    session{coach.sessions.length !== 1 ? 's' : ''} today
                  </p>
                </div>
                {/* Hover tooltip */}
                <div className="absolute left-0 top-full mt-1.5 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-56 card shadow-xl pointer-events-none">
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest mb-2">Schedule</p>
                  <div className="space-y-1.5">
                    {coach.sessions.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </span>
                        <span className="text-xs text-slate-300 truncate">{s.student_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="px-5 py-3 border-b border-court-light">
            <input
              type="text"
              className="input w-full text-sm"
              placeholder="Search by name or email…"
              value={memberListSearch}
              onChange={e => setMemberListSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <p className="text-slate-300 text-sm p-5">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-slate-300 text-sm p-5">No members found.</p>
          ) : (() => {
            const ROLE_ORDER = { admin: 0, coach: 1, member: 2 }
            const s = memberListSearch.toLowerCase().trim()
            const filtered = members
              .filter(m => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3))
            return filtered.length === 0 ? (
              <p className="text-slate-300 text-sm p-5">No members match your search.</p>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-court z-10">
                    <tr className="border-b border-court-light">
                      {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(m => (
                      <tr key={m.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-white w-[20%]">{m.name}</td>
                        <td className="px-5 py-3 text-slate-300 w-[30%]">{m.email}</td>
                        <td className="px-5 py-3 w-[15%]">
                          <span className={`badge border ${
                            m.role === 'admin' ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                            : m.role === 'coach' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-court-light text-slate-400 border-court-light'}`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-300 w-[20%]">{fmtDate(m.created_at)}</td>
                        <td className="px-5 py-3 w-[15%]">
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
            )
          })()}
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
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 items-center">
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
                  <div className="">{dowLabel}</div>
                  <div className="text-xs opacity-80">{dayLabel}</div>
                </button>
              )
            })}
            <input
              type="date"
              className="input flex-shrink-0 text-sm"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              title="Pick any date"
            />
          </div>

          {/* Calendar view */}
          <div className="card p-0 overflow-hidden">
            {loading ? (
              <p className="text-slate-300 text-sm p-5">Loading schedule…</p>
            ) : (() => {
              const search         = memberSearch.toLowerCase().trim()
              const firstSlotMins  = slotsForDay.length ? toMins(slotsForDay[0]) : 0

              // Build a unified event list (booking / coaching / social)
              const allEvents = [
                ...bookings
                  .filter(b => !search || b.user_name.toLowerCase().includes(search))
                  .map(b => ({ key: `b-${b.booking_group_id}`, type: 'booking', ...b })),
                ...bookingViewSessions
                  .filter(s => !search || s.student_name.toLowerCase().includes(search))
                  .map(s => ({ key: `c-${s.id}`, type: 'coaching', ...s })),
                ...bookingViewSocialSessions
                  .filter(s => !search || s.participants.some(p => p.name.toLowerCase().includes(search)))
                  .map(s => ({ key: `sp-${s.id}`, type: 'social', ...s })),
              ]

              const laid = layoutEvents(allEvents)

              return (
                <div className="flex">
                  {/* Left: time axis + free-court count */}
                  <div className="flex-shrink-0 w-28 border-r border-court-light">
                    {slotsForDay.map(slot => {
                      const free      = countFreeAtSlot(bookings, bookingViewSessions, bookingViewSocialSessions, slot)
                      const freeColor = free === 0 ? 'text-red-400' : free <= 2 ? 'text-yellow-400' : 'text-emerald-400'
                      return (
                        <div
                          key={slot}
                          style={{ height: SLOT_H }}
                          className="flex items-start pt-2.5 px-3 border-b border-court-light/30 last:border-0 gap-1"
                        >
                          <span className="text-[11px] text-slate-300 font-mono leading-none">{fmtTime(slot)}</span>
                          <span className={`ml-auto text-[11px] leading-none ${freeColor}`}>{free}/6</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Right: event canvas (absolutely positioned blocks) */}
                  <div
                    className="flex-1 relative"
                    style={{ height: slotsForDay.length * SLOT_H }}
                  >
                    {/* Horizontal grid lines */}
                    {slotsForDay.map((slot, i) => (
                      <div
                        key={slot}
                        className="absolute w-full border-t border-court-light/20"
                        style={{ top: i * SLOT_H }}
                      />
                    ))}

                    {laid.length === 0 && (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-700">
                        No bookings for this date.
                      </p>
                    )}

                    {laid.map(ev => {
                      const startMins = toMins(ev.start_time)
                      const endMins   = toMins(ev.end_time)
                      const top       = (startMins - firstSlotMins) / 30 * SLOT_H + 2
                      const height    = Math.max((endMins - startMins) / 30 * SLOT_H - 4, 20)
                      const laneW     = 100 / ev.totalLanes
                      const left      = `calc(${ev.lane * laneW}% + 3px)`
                      const width     = `calc(${laneW}% - 6px)`

                      if (ev.type === 'booking') {
                        const checkedIn = adminCheckIns.some(
                          ci => ci.type === 'booking' && ci.reference_id === ev.booking_group_id && ci.user_id === ev.user_id
                        )
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height, left, width }}
                            className="bg-brand-500/15 border border-brand-500/40 rounded-lg px-2.5 py-1.5 overflow-hidden flex flex-col"
                          >
                            <p className="text-brand-300 text-xs truncate leading-none">{ev.user_name}</p>
                            <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-between gap-1">
                              {checkedIn ? (
                                <span className="text-xs text-emerald-400 leading-none">✓ In</span>
                              ) : (
                                <button
                                  onClick={() => handleAdminCheckIn('booking', ev.booking_group_id, ev.user_id)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 text-left leading-none"
                                >
                                  Check In
                                </button>
                              )}
                              <button
                                onClick={() => handleCancelBooking(ev.booking_group_id)}
                                className="text-xs text-red-400 hover:text-red-300 leading-none"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      }

                      if (ev.type === 'coaching') {
                        const checkedIn = adminCheckIns.some(
                          ci => ci.type === 'coaching' && ci.reference_id === String(ev.id) && ci.user_id === ev.student_id
                        )
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height, left, width }}
                            className="bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 overflow-hidden flex flex-col"
                          >
                            <p className="text-emerald-300 text-xs truncate leading-none">{ev.student_name}</p>
                            <p className="text-slate-300 text-xs mt-1 leading-none">Coach: {ev.coach_name}</p>
                            <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-between gap-1">
                              {checkedIn ? (
                                <span className="text-xs text-emerald-400 leading-none">✓ In</span>
                              ) : (
                                <button
                                  onClick={() => handleAdminCheckIn('coaching', ev.id, ev.student_id)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 text-left leading-none"
                                >
                                  Check In
                                </button>
                              )}
                              <button
                                onClick={() => handleCancelSession(ev.id)}
                                className="text-xs text-red-400 hover:text-red-300 leading-none"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      }

                      // social — show how many participants have checked in
                      const socialCheckinCount = adminCheckIns.filter(
                        ci => ci.type === 'social' && ci.reference_id === String(ev.id)
                      ).length
                      return (
                        <div
                          key={ev.key}
                          style={{ position: 'absolute', top, height, left, width }}
                          className="bg-violet-500/15 border border-violet-500/40 rounded-lg px-2.5 py-1.5 overflow-hidden flex flex-col"
                        >
                          <p className="text-violet-300 text-xs truncate leading-none">{ev.title}</p>
                          <p className="text-slate-300 text-xs mt-1 leading-none">{ev.num_courts} court{ev.num_courts !== 1 ? 's' : ''}</p>
                          <p className="text-slate-300 text-xs mt-0.5 leading-none">{ev.participant_count}/{ev.max_players} players</p>
                          <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                          {socialCheckinCount > 0 && (
                            <p className="text-xs text-emerald-400 mt-0.5 leading-none">✓ {socialCheckinCount} checked in</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      {/* ── Coaching tab ─────────────────────────────────────────────────── */}
      {activeTab === 'Coaching' && (
        <div className="animate-fade-in space-y-10">

          {/* ── Sessions section ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg text-white">Coaching Sessions</h2>
              <button
                onClick={() => setShowSessionForm(v => !v)}
                className="btn-primary text-sm"
              >
                {showSessionForm ? 'Cancel' : '+ Schedule Session'}
              </button>
            </div>

            {/* Schedule session form */}
            {showSessionForm && (() => {
              const formDow   = sessionForm.date ? new Date(sessionForm.date + 'T12:00:00').getDay() : null
              const formSlots = formDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
              const endSlots  = formSlots.filter(s => !sessionForm.start_time || toMins(s) > toMins(sessionForm.start_time))
              return (
                <div className="card mb-6 space-y-4">
                  <p className="text-xs text-slate-300 uppercase tracking-widest">New Coaching Session</p>

                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Coach</label>
                    <select className="input w-full" value={sessionForm.coach_id}
                      onChange={e => setSessionForm(f => ({ ...f, coach_id: e.target.value }))}>
                      <option value="">Select coach…</option>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Student (Member)</label>
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="Search student name…"
                      value={studentSearch}
                      onChange={e => {
                        setStudentSearch(e.target.value)
                        setSessionForm(f => ({ ...f, student_id: '' }))
                      }}
                    />
                    {studentSearch && (
                      <div className="mt-1 border border-court-light rounded-lg overflow-y-auto max-h-[160px] bg-court">
                        {members
                          .filter(m => m.name.toLowerCase().includes(studentSearch.toLowerCase()) || m.email.toLowerCase().includes(studentSearch.toLowerCase()))
                          .map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSessionForm(f => ({ ...f, student_id: String(m.id) }))
                                setStudentSearch(m.name)
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-court-light/40 transition-colors ${
                                String(sessionForm.student_id) === String(m.id) ? 'text-brand-300 bg-court-light/20' : 'text-slate-300'
                              }`}
                            >
                              {m.name}
                              <span className="text-slate-400 text-xs ml-2">{m.email}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Date</label>
                    <input type="date" className="input w-full" value={sessionForm.date}
                      onChange={e => setSessionForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-200 mb-1">Start Time</label>
                      <select className="input w-full" value={sessionForm.start_time}
                        onChange={e => setSessionForm(f => ({ ...f, start_time: e.target.value, end_time: '' }))}>
                        <option value="">Select…</option>
                        {formSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-200 mb-1">End Time</label>
                      <select className="input w-full" value={sessionForm.end_time}
                        onChange={e => setSessionForm(f => ({ ...f, end_time: e.target.value }))}
                        disabled={!sessionForm.start_time}>
                        <option value="">Select…</option>
                        {endSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-200 mb-1">
                      Recurring — generate for N weeks (1 = one-off)
                    </label>
                    <input type="number" min={1} max={52} className="input w-32"
                      value={sessionForm.weeks}
                      onChange={e => setSessionForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Notes (optional)</label>
                    <textarea className="input w-full h-20 resize-none"
                      placeholder="e.g. Focus on backhand technique"
                      value={sessionForm.notes}
                      onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>

                  <button onClick={handleCreateSession} className="btn-primary text-sm">
                    Create Session{sessionForm.weeks > 1 ? ` (${sessionForm.weeks} weeks)` : ''}
                  </button>
                </div>
              )
            })()}

            {/* Date picker */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 items-center">
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
                    <div className="">{dowLabel}</div>
                    <div className="text-xs opacity-80">{dayLabel}</div>
                  </button>
                )
              })}
              <input
                type="date"
                className="input flex-shrink-0 text-sm"
                value={coachingDate}
                onChange={e => setCoachingDate(e.target.value)}
                title="Pick any date"
              />
            </div>

            {/* Sessions table */}
            {loading ? (
              <p className="text-slate-300 text-sm">Loading sessions…</p>
            ) : coachingSessions.length === 0 ? (
              <p className="text-slate-300 text-sm">No coaching sessions on this date.</p>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-court-light">
                      {['Student', 'Coach', 'Time', 'Notes', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coachingSessions.map(s => {
                      const checkedIn = adminCheckedIn.has(s.id)
                      return (
                      <tr key={s.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-white">{s.student_name}</p>
                          <p className="text-slate-400 text-xs">{s.student_email}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-300">{s.coach_name}</td>
                        <td className="px-5 py-3 text-slate-300 text-xs font-mono whitespace-nowrap">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                          {s.notes ?? '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {checkedIn ? (
                              <span className="text-xs text-emerald-400">Checked In ✓</span>
                            ) : (
                              <button
                                onClick={() => handleAdminCheckInCoaching(s.id, s.student_id)}
                                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                              >
                                Check In
                              </button>
                            )}
                            <button
                              onClick={() => handleCancelSession(s.id)}
                              className="text-xs text-red-400 hover:text-red-300 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}

                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Coaches section ── */}
          <div>
            <button
              onClick={() => setShowCoachesSection(v => !v)}
              className="flex items-center gap-2 text-lg text-white mb-4 hover:text-slate-300 transition-colors"
            >
              <span>{showCoachesSection ? '▾' : '▸'}</span>
              Coaches
            </button>

            {showCoachesSection && <>
            {/* Add coach form */}
            <div className="card mb-4 space-y-3">
              <p className="text-xs text-slate-300 uppercase tracking-widest">Add Coach</p>
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
                <label className="block text-xs text-slate-200 mb-1">Link to Member Account (optional)</label>
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
              <p className="text-slate-300 text-sm">Loading…</p>
            ) : coaches.length === 0 ? (
              <p className="text-slate-300 text-sm">No coaches yet.</p>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-court-light">
                      {['Name', 'Bio', 'Linked Account', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coaches.map(c => (
                      <tr key={c.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                        <td className="px-5 py-3 text-slate-300 text-xs max-w-xs truncate">{c.bio ?? '—'}</td>
                        <td className="px-5 py-3 text-xs">
                          {c.user_id
                            ? (() => {
                                const u = members.find(m => m.id === c.user_id)
                                return u
                                  ? <span className="text-sky-400">{u.name}</span>
                                  : <span className="text-slate-500">ID {c.user_id}</span>
                              })()
                            : <span className="text-slate-400">—</span>
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
            </>}
          </div>

          {/* ── Pay Period Report ── */}
          <div>
            <button
              onClick={() => setShowPayReport(v => !v)}
              className="flex items-center gap-2 text-lg text-white mb-4 hover:text-slate-300 transition-colors"
            >
              <span>{showPayReport ? '▾' : '▸'}</span>
              Pay Period Report
            </button>

            {showPayReport && <>
            <p className="text-xs text-slate-300 mb-4">
              A session counts toward pay when <span className="text-white font-medium">an admin checks in</span>, or when <span className="text-white font-medium">both the student and the coach</span> have self-checked in.
            </p>

            {/* Date range picker */}
            <div className="card mb-6">
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-xs text-slate-200 mb-1">From</label>
                  <input type="date" className="input" value={payFrom}
                    onChange={e => setPayFrom(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-slate-200 mb-1">To</label>
                  <input type="date" className="input" value={payTo}
                    onChange={e => setPayTo(e.target.value)} />
                </div>
                <button
                  onClick={handleLoadPayReport}
                  disabled={payLoading}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {payLoading ? 'Loading…' : 'Generate Report'}
                </button>
              </div>
            </div>

            {/* Report results */}
            {payReport !== null && (
              payReport.length === 0 ? (
                <p className="text-slate-300 text-sm">No confirmed coaching sessions in this period.</p>
              ) : (
                <div className="space-y-6">
                  {payReport.map(coach => {
                    const weeks = groupByWeek(coach.sessions)
                    return (
                      <div key={coach.coach_id} className="card p-0 overflow-hidden">

                        {/* Coach header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-court-light bg-court-light/20">
                          <div>
                            <p className="text-white">{coach.coach_name}</p>
                            {!coach.has_account && (
                              <p className="text-[10px] text-yellow-500 mt-0.5">
                                No linked account — coach check-in unavailable; sessions will not count
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-emerald-400">{coach.counted} counted</p>
                            <p className="text-xs text-slate-500">{coach.total} total sessions</p>
                          </div>
                        </div>

                        {/* Per-week groups */}
                        {weeks.map(week => (
                          <div key={week.weekStart}>
                            {/* Week sub-header */}
                            <div className="flex items-center justify-between px-5 py-2 bg-court-light/10 border-b border-court-light/40">
                              <p className="text-xs text-slate-400">
                                Week of {new Date(week.weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                              </p>
                              <p className="text-xs text-slate-500">
                                <span className="text-emerald-400">{week.counted}</span>
                                {' '}/ {week.total} counted
                              </p>
                            </div>

                            {/* Session rows */}
                            <table className="w-full text-sm">
                              <tbody>
                                {week.sessions.map(s => (
                                  <tr
                                    key={s.session_id}
                                    className={`border-b border-court-light/30 last:border-0 ${s.counted ? '' : 'opacity-50'}`}
                                  >
                                    <td className="px-5 py-2.5 text-slate-300 text-xs whitespace-nowrap">
                                      {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </td>
                                    <td className="px-5 py-2.5 text-white text-xs">{s.student_name}</td>
                                    <td className="px-5 py-2.5 text-slate-300 text-xs font-mono whitespace-nowrap">
                                      {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                                    </td>
                                    {/* Check-in status */}
                                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                      {s.admin_checked_in ? (
                                        <span className="text-sky-400">Admin ✓</span>
                                      ) : (
                                        <span className="space-x-2">
                                          <span className={s.student_checked_in ? 'text-emerald-400' : 'text-red-400'}>
                                            Student {s.student_checked_in ? '✓' : '✗'}
                                          </span>
                                          <span className={
                                            s.coach_checked_in === null ? 'text-slate-400' :
                                            s.coach_checked_in ? 'text-emerald-400' : 'text-red-400'
                                          }>
                                            {s.coach_checked_in === null ? 'Coach N/A' : `Coach ${s.coach_checked_in ? '✓' : '✗'}`}
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                    {/* Counted status */}
                                    <td className="px-3 py-2.5 text-xs">
                                      {s.counted
                                        ? <span className="text-emerald-400">Counted</span>
                                        : <span className="text-slate-400">Not counted</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            )}
            </>}
          </div>

        </div>
      )}

      {/* ── Social Play tab ──────────────────────────────────────────────── */}
      {activeTab === 'Social Play' && (
        <div className="animate-fade-in space-y-8">

          {/* Create session button + form */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg text-white">Social Play Sessions</h2>
              <button
                onClick={() => setShowSocialForm(v => !v)}
                className="btn-primary text-sm"
              >
                {showSocialForm ? 'Cancel' : '+ Open a Slot'}
              </button>
            </div>

            {showSocialForm && (
              <div className="card mb-6 space-y-4">
                <p className="text-xs text-slate-300 uppercase tracking-widest">New Social Play Session</p>

                <div>
                  <label className="block text-xs text-slate-200 mb-1">Title (optional — default: "Social Play")</label>
                  <input
                    type="text" className="input w-full" placeholder="e.g. Saturday Casual"
                    value={socialForm.title}
                    onChange={e => setSocialForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-200 mb-1">Description (optional)</label>
                  <textarea
                    className="input w-full h-20 resize-none" placeholder="Any notes for members…"
                    value={socialForm.description}
                    onChange={e => setSocialForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-200 mb-1">Number of Courts</label>
                  <select
                    className="input w-full"
                    value={socialForm.num_courts}
                    onChange={e => setSocialForm(f => ({ ...f, num_courts: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n} court{n !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-200 mb-1">Date</label>
                  <input
                    type="date" className="input w-full" value={socialForm.date}
                    onChange={e => setSocialForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-200 mb-1">Start Time (HH:MM)</label>
                    <input
                      type="text" className="input w-full" placeholder="e.g. 18:00"
                      value={socialForm.start_time}
                      onChange={e => setSocialForm(f => ({ ...f, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-200 mb-1">End Time (HH:MM)</label>
                    <input
                      type="text" className="input w-full" placeholder="e.g. 20:00"
                      value={socialForm.end_time}
                      onChange={e => setSocialForm(f => ({ ...f, end_time: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-200 mb-1">Max Players</label>
                  <input
                    type="number" min={2} max={50} className="input w-32"
                    value={socialForm.max_players}
                    onChange={e => setSocialForm(f => ({ ...f, max_players: e.target.value }))}
                  />
                </div>

                <button onClick={handleCreateSocialSession} className="btn-primary text-sm">
                  Open Session
                </button>
              </div>
            )}
          </div>

          {/* Sessions list */}
          {loading ? (
            <p className="text-slate-300 text-sm">Loading sessions…</p>
          ) : socialSessions.length === 0 ? (
            <p className="text-slate-300 text-sm">No upcoming social play sessions. Open a slot above.</p>
          ) : (
            <div className="space-y-4 overflow-y-auto" style={{ maxHeight: '780px' }}>
              {socialSessions.map(s => {
                const timeEdit = editingTimes[s.id]
                return (
                  <div key={s.id} className="card flex flex-col gap-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white text-base">{s.title}</p>
                        <p className="text-xs text-slate-300 mt-0.5 font-medium">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        {s.description && (
                          <p className="text-sm text-slate-300 mt-1">{s.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleCancelSocialSession(s.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Courts adjuster */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 font-medium w-20">Courts</span>
                      <button
                        onClick={() => handleCourtChange(s.id, -1)}
                        disabled={s.num_courts <= 1}
                        className="w-7 h-7 rounded border border-court-light text-slate-200 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        −
                      </button>
                      <span className="text-white w-4 text-center">{s.num_courts}</span>
                      <button
                        onClick={() => handleCourtChange(s.id, +1)}
                        disabled={s.num_courts >= 6}
                        className="w-7 h-7 rounded border border-court-light text-slate-200 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        +
                      </button>
                    </div>

                    {/* Time adjuster */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 font-medium w-20">Time</span>
                      {timeEdit ? (
                        <>
                          <input
                            type="time"
                            className="input py-1 px-2 text-xs w-28"
                            value={timeEdit.start_time}
                            onChange={e => setEditingTimes(prev => ({ ...prev, [s.id]: { ...prev[s.id], start_time: e.target.value } }))}
                          />
                          <span className="text-slate-300 text-xs">–</span>
                          <input
                            type="time"
                            className="input py-1 px-2 text-xs w-28"
                            value={timeEdit.end_time}
                            onChange={e => setEditingTimes(prev => ({ ...prev, [s.id]: { ...prev[s.id], end_time: e.target.value } }))}
                          />
                          <button
                            onClick={() => handleSaveTime(s.id)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingTimes(prev => { const n = { ...prev }; delete n[s.id]; return n })}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-white text-sm font-mono font-medium">
                            {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                          </span>
                          <button
                            onClick={() => setEditingTimes(prev => ({
                              ...prev,
                              [s.id]: { start_time: s.start_time.substring(0, 5), end_time: s.end_time.substring(0, 5) },
                            }))}
                            className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>

                    {/* Participant count + names */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-medium">
                        <span>{s.participant_count} / {s.max_players} players joined</span>
                      </div>
                      <div className="h-1.5 bg-court-dark rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${s.participant_count / s.max_players >= 0.9 ? 'bg-red-500' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(Math.round(s.participant_count / s.max_players * 100), 100)}%` }}
                        />
                      </div>
                      {s.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {s.participants.map(p => (
                            <span key={p.id} className="text-xs bg-court-light text-slate-100 rounded-full px-2.5 py-0.5 font-medium">
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}

    </div>
  )
}
