import React, { useState, useEffect, useMemo } from 'react'
import { adminAPI, bookingsAPI, coachingAPI, socialAPI, checkinAPI, analyticsAPI } from '@/api/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

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

  // Coaching sessions: deduplicate by court_id so group sessions (multiple
  // students on the same court) only count as 1 court.
  const coachingCourts = new Set(sessions.filter(inSlot).map(s => s.court_id)).size

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


const TABS = ['Today', 'Members', 'Bookings', 'Coaching', 'Social Play', 'Pay Report', 'Analytics']

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
  const [activeTab,    setActiveTab]    = useState('Today')
const [members,      setMembers]      = useState([])
  const [bookings,                setBookings]                = useState([])
  const [bookingViewSessions,     setBookingViewSessions]     = useState([])
  const [bookingViewSocialSessions, setBookingViewSocialSessions] = useState([])
  const [adminCheckIns,           setAdminCheckIns]           = useState([]) // { type, reference_id, user_id }
  const [memberSearch,       setMemberSearch]       = useState('')
  const [memberListSearch,   setMemberListSearch]   = useState('')
  const [showAddMember,      setShowAddMember]      = useState(false)
  const [addMemberForm,      setAddMemberForm]      = useState({ name: '', email: '', password: '', phone: '' })
  const [addMemberError,     setAddMemberError]     = useState('')
  const [loading,      setLoading]      = useState(false)
  const [coachModal,   setCoachModal]   = useState(null) // { id, name } of member being promoted
  const [coachForm,    setCoachForm]    = useState({ availability_start: '', availability_end: '', bio: '', resume: null })
  const [coachDragging, setCoachDragging] = useState(false)
  const [coachSubmitting, setCoachSubmitting] = useState(false)

  // Today's per-coach session summary (shown in the header stat area)
  const [todayCoachSummary, setTodayCoachSummary] = useState([])

  // Coaching state
  const [coaches,             setCoaches]             = useState([])
  const [coachingSessions,    setCoachingSessions]    = useState([])
  const [allCoachingSessions, setAllCoachingSessions] = useState([])
  const [coachingDate,        setCoachingDate]        = useState(() => {
    const dates = getUpcomingOpenDates(1)
    return dates.length ? toISO(dates[0]) : ''
  })
  const [showSessionForm,  setShowSessionForm]  = useState(false)
  const [rescheduleModal,  setRescheduleModal]  = useState(null) // { studentName, sessions }
  const [rescheduleDates,  setRescheduleDates]  = useState({})  // { [id]: 'YYYY-MM-DD' }
  const [rescheduleTime,   setRescheduleTime]   = useState({ start_time: '', end_time: '' })
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
const [sessionForm,      setSessionForm]      = useState({
    coach_id: '', student_id: '',
    date: '', start_time: '', end_time: '', notes: '', weeks: 10,
  })
  const [studentSearch,    setStudentSearch]    = useState('')
  const [coachingSearch,   setCoachingSearch]   = useState('')
  // Group coaching
  const [coachingSubTab,   setCoachingSubTab]   = useState('one-on-one')
  const [groupSessions,    setGroupSessions]    = useState([])
  const [showGroupForm,    setShowGroupForm]    = useState(false)
  const [groupStudentSearch, setGroupStudentSearch] = useState('')
  const [groupForm,        setGroupForm]        = useState({
    coach_id: '', student_ids: [], date: '', start_time: '', end_time: '', notes: '', weeks: 1,
  })
  const [rescheduleGroupId,   setRescheduleGroupId]   = useState(null)
  const [rescheduleGroupForm, setRescheduleGroupForm] = useState({ date: '', start_time: '', end_time: '' })
  const [socialSearch,     setSocialSearch]     = useState('')
  // Set of session IDs the admin has checked in during this tab visit
  const [adminCheckedIn,   setAdminCheckedIn]   = useState(new Set())
  // Pay period report state
  const [payFrom, setPayFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 13); return toISO(d)
  })
  const [payTo,      setPayTo]      = useState(() => toISO(new Date()))
  const [payReport,  setPayReport]  = useState(null)
  const [payLoading, setPayLoading] = useState(false)

  // Today summary state
  const [todaySummary,    setTodaySummary]    = useState(null)
  const [todayLoading,    setTodayLoading]    = useState(false)
  const [todayError,      setTodayError]      = useState(null)

  // Analytics state
  const [analyticsData,    setAnalyticsData]    = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [attendanceFilter, setAttendanceFilter] = useState('all') // 'all' | 'active' | 'inactive'
  const [attendanceSearch, setAttendanceSearch] = useState('')

  // Social Play state
  const [socialSessions,    setSocialSessions]    = useState([])
  const [showSocialForm,    setShowSocialForm]    = useState(false)
  const [socialPage,        setSocialPage]        = useState(0)
  const [socialDateFilter,  setSocialDateFilter]  = useState('')
  const [socialForm,      setSocialForm]      = useState({
    title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12, weeks: 1,
  })
  // { [sessionId]: { start_time: 'HH:MM', end_time: 'HH:MM' } } — open when admin is editing times
  const [editingTimes, setEditingTimes] = useState({})
  // { [sessionId]: { query: '', userId: '' } } — add-member state per session
  const [addingMember, setAddingMember] = useState({})

  // Default selected date = first upcoming open day
  const [selectedDate, setSelectedDate] = useState(() => {
    const dates = getUpcomingOpenDates(1)
    return dates.length ? toISO(dates[0]) : ''
  })

  const upcomingDates = getUpcomingOpenDates(7)

  // Derive time slots for the selected date
  const selectedDow = selectedDate ? new Date(selectedDate + 'T12:00:00').getDay() : null
  const slotsForDay = OPEN_DAYS.find(d => d.dow === selectedDow)?.slots ?? WEEKDAY_SLOTS

  // Fetch today's coaching sessions once on mount
  useEffect(() => {
    const today = toISO(new Date())
    Promise.allSettled([
      coachingAPI.getSessions({ date: today }),
    ]).then(([coachRes]) => {
      if (coachRes.status === 'fulfilled') {
        const sessions = coachRes.value.data.sessions
        const byCoach = {}
        const seenGroups = new Set()
        for (const s of sessions) {
          if (s.group_id) {
            if (seenGroups.has(s.group_id)) continue
            seenGroups.add(s.group_id)
          }
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

  const handleRoleToggle = async (id, currentRole, name) => {
    const newRole = currentRole === 'member' ? 'admin' : 'member'
    const action = newRole === 'admin' ? `Promote ${name} to admin?` : `Demote ${name} to member?`
    if (!window.confirm(action)) return
    try {
      await adminAPI.updateMemberRole(id, { role: newRole })
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m))
      // If demoting a coach, also remove from coaches table and refresh list
      if (currentRole === 'coach') {
        try { await coachingAPI.deleteCoachByUserId(id) } catch {}
        coachingAPI.getCoaches().then(({ data }) => setCoaches(data.coaches ?? [])).catch(() => {})
      }
    } catch {
      alert('Could not update role. Please try again.')
    }
  }

  const handleMakeCoachSubmit = async () => {
    if (coachForm.availability_start && coachForm.availability_end && coachForm.availability_end < coachForm.availability_start) {
      alert('End date must be after start date.')
      return
    }
    setCoachSubmitting(true)
    try {
      const fd = new FormData()
      if (coachForm.availability_start) fd.append('availability_start', coachForm.availability_start)
      if (coachForm.availability_end)   fd.append('availability_end',   coachForm.availability_end)
      if (coachForm.bio)                fd.append('bio', coachForm.bio)
      if (coachForm.resume)             fd.append('resume', coachForm.resume)
      await adminAPI.makeCoach(coachModal.id, fd)
      setMembers(prev => prev.map(m => m.id === coachModal.id ? { ...m, role: 'coach' } : m))
      setCoachModal(null)
      setCoachForm({ availability_start: '', availability_end: '', bio: '', resume: null })
    } catch (err) {
      alert(err.response?.data?.message ?? err.message ?? 'Could not promote to coach.')
    } finally {
      setCoachSubmitting(false)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    setAddMemberError('')
    try {
      const { data } = await adminAPI.createMember(addMemberForm)
      setMembers(prev => [data.member, ...prev])
      setAddMemberForm({ name: '', email: '', password: '', phone: '' })
      setShowAddMember(false)
    } catch (err) {
      setAddMemberError(err.response?.data?.message ?? 'Could not add member.')
    }
  }

  const handleRemoveMember = async (id, name, role) => {
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return
    try {
      if (role === 'coach') {
        try { await coachingAPI.deleteCoachByUserId(id) } catch {}
      }
      await adminAPI.deleteMember(id)
      setMembers(prev => prev.filter(m => m.id !== id))
      if (role === 'coach') {
        coachingAPI.getCoaches().then(({ data }) => setCoaches(data.coaches ?? [])).catch(() => {})
      }
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
    Promise.allSettled([
      coachingAPI.getCoaches(),
      coachingAPI.getSessions({ date: coachingDate }),
      coachingAPI.getSessions({}),
      membersFetch,
      coachingAPI.getGroupSessions({ date: coachingDate }),
    ])
      .then(([cr, sr, ar, mr, gr]) => {
        if (!cancelled) {
          if (cr.status === 'fulfilled') setCoaches(cr.value.data.coaches)
          if (sr.status === 'fulfilled') setCoachingSessions(sr.value.data.sessions)
          if (ar.status === 'fulfilled') setAllCoachingSessions(ar.value.data.sessions)
          if (mr.status === 'fulfilled' && members.length === 0) setMembers(mr.value.data.members)
          if (gr.status === 'fulfilled') setGroupSessions(gr.value.data.groups)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, coachingDate])

  // Fetch social play sessions when Social Play tab is active
  useEffect(() => {
    if (activeTab !== 'Social Play') return
    let cancelled = false
    setLoading(true)
    const membersFetch = members.length === 0 ? adminAPI.getAllMembers() : Promise.resolve({ data: { members } })
    Promise.all([socialAPI.getAdminSessions(), membersFetch])
      .then(([{ data: sd }, { data: md }]) => {
        if (!cancelled) {
          setSocialSessions(sd.sessions)
          if (members.length === 0) setMembers(md.members)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab])

  const loadTodaySummary = () => {
    setTodayLoading(true)
    setTodayError(null)
    checkinAPI.getTodaySummary()
      .then(({ data }) => setTodaySummary(data))
      .catch(err => setTodayError(err.response?.data?.message ?? 'Failed to load today\'s summary.'))
      .finally(() => setTodayLoading(false))
  }

  // Fetch today summary when Today tab is active
  useEffect(() => {
    if (activeTab !== 'Today') return
    loadTodaySummary()
  }, [activeTab])

  // Fetch analytics when Analytics tab is active
  useEffect(() => {
    if (activeTab !== 'Analytics') return
    if (analyticsData) return  // already loaded
    setAnalyticsLoading(true)
    analyticsAPI.getOverview()
      .then(({ data }) => setAnalyticsData(data))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false))
  }, [activeTab])

  const handleCreateSocialSession = async () => {
    const { title, description, num_courts, date, start_time, end_time, max_players, weeks } = socialForm
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
        weeks: Number(weeks) || 1,
      })
      setSocialSessions(prev => [...prev, ...data.sessions])
      setShowSocialForm(false)
      setSocialForm({ title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12, weeks: 1 })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not create session.')
    }
  }

  const handleCancelSocialSeries = async (recurrenceId) => {
    if (!window.confirm('Cancel ALL future sessions in this series?')) return
    try {
      const { data } = await socialAPI.cancelRecurringSessions(recurrenceId)
      setSocialSessions(prev => prev.filter(s => s.recurrence_id !== recurrenceId || new Date(s.date + 'T12:00:00') < new Date()))
      alert(data.message)
    } catch {
      alert('Could not cancel series.')
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

  const handleSocialAddMember = async (sessionId, userId) => {
    if (!userId) return
    try {
      await socialAPI.adminAddMember(sessionId, userId)
      const { data } = await socialAPI.getAdminSessions({})
      setSocialSessions(data.sessions)
      setAddingMember(prev => { const n = { ...prev }; delete n[sessionId]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add member.')
    }
  }

  const handleSocialRemoveMember = async (sessionId, userId) => {
    try {
      await socialAPI.adminRemoveMember(sessionId, userId)
      setSocialSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, participants: s.participants.filter(p => p.id !== userId), participant_count: s.participant_count - 1 }
          : s
      ))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not remove member.')
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

  const handleOpenReschedule = (session) => {
    const seriesSessions = session.recurrence_id
      ? allCoachingSessions.filter(s => s.recurrence_id === session.recurrence_id)
      : [session]
    const sorted = [...seriesSessions].sort((a, b) => (a.date < b.date ? -1 : 1))
    setRescheduleModal({ studentName: session.student_name, sessions: sorted })
    setRescheduleDates({})
    setRescheduleTime({ start_time: '', end_time: '' })
  }

  const refreshAfterReschedule = async () => {
    const [cur, all] = await Promise.all([
      coachingAPI.getSessions({ date: coachingDate }),
      coachingAPI.getSessions({}),
    ])
    setCoachingSessions(cur.data.sessions)
    setAllCoachingSessions(all.data.sessions)
  }

  const handleMoveSingle = async (sessionId) => {
    const pickedDate = rescheduleDates[sessionId]
    const currentDate = rescheduleModal?.sessions.find(s => s.id === sessionId)?.date
    const newDate = pickedDate || currentDate
    if (!newDate) return
    setRescheduleSaving(true)
    const { start_time: newStart, end_time: newEnd } = rescheduleTime
    try {
      await coachingAPI.rescheduleSession(sessionId, newDate, newStart || undefined, newEnd || undefined)
      await refreshAfterReschedule()
      // update modal in-place
      const patch = { date: newDate, ...(newStart && newEnd ? { start_time: newStart, end_time: newEnd } : {}) }
      setRescheduleModal(prev => prev ? {
        ...prev,
        sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, ...patch } : s),
      } : null)
      setRescheduleDates(prev => { const n = { ...prev }; delete n[sessionId]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
    } finally { setRescheduleSaving(false) }
  }

  const handleMoveFromHere = async (sessionId) => {
    const newDate = rescheduleDates[sessionId]
    if (!newDate) return alert('Pick a new date for this session.')
    const sessions = rescheduleModal?.sessions ?? []
    const idx = sessions.findIndex(s => s.id === sessionId)
    if (idx < 0) return
    const oldDate  = new Date(sessions[idx].date + 'T12:00:00Z')
    const nDate    = new Date(newDate + 'T12:00:00Z')
    const deltaDays = Math.round((nDate - oldDate) / 86400000)
    const newStart  = rescheduleTime.start_time || null
    const newEnd    = rescheduleTime.end_time   || null
    const updates = sessions.slice(idx).map(s => {
      const d = new Date(s.date + 'T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + deltaDays)
      const u = { id: s.id, date: d.toISOString().slice(0, 10) }
      if (newStart && newEnd) { u.start_time = newStart; u.end_time = newEnd }
      return u
    })
    setRescheduleSaving(true)
    try {
      await coachingAPI.rescheduleBulk(updates)
      await refreshAfterReschedule()
      setRescheduleModal(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
    } finally { setRescheduleSaving(false) }
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

  const handleCreateGroupSession = async () => {
    const { coach_id, student_ids, date, start_time, end_time, notes, weeks } = groupForm
    if (!coach_id || student_ids.length < 2 || !date || !start_time || !end_time) {
      alert('Select a coach, at least 2 students, date and times.')
      return
    }
    try {
      await coachingAPI.createGroupSession({ coach_id, student_ids, date, start_time, end_time, notes, weeks })
      setShowGroupForm(false)
      setGroupForm({ coach_id: '', student_ids: [], date: '', start_time: '', end_time: '', notes: '', weeks: 1 })
      setGroupStudentSearch('')
      const [{ data: sd }, { data: gd }] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getGroupSessions({ date: coachingDate }),
      ])
      setCoachingSessions(sd.sessions)
      setGroupSessions(gd.groups)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not schedule group session.')
    }
  }

  const handleCancelGroupSession = async (groupId) => {
    if (!window.confirm('Cancel all sessions in this group?')) return
    try {
      await coachingAPI.cancelGroupSession(groupId)
      setGroupSessions(prev => prev.filter(g => g.group_id !== groupId))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel group session.')
    }
  }

  const handleRescheduleGroupSession = async () => {
    const { date, start_time, end_time } = rescheduleGroupForm
    if (!date) return alert('Please select a date.')
    try {
      await coachingAPI.rescheduleGroupSession(rescheduleGroupId, date, start_time, end_time)
      const { data } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(data.groups)
      setRescheduleGroupId(null)
      setRescheduleGroupForm({ date: '', start_time: '', end_time: '' })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule group session.')
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
                <div className="absolute left-0 top-full mt-1.5 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-64 card shadow-xl pointer-events-none">
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest mb-2">Schedule</p>
                  <div className="space-y-1.5">
                    {coach.sessions.map(s => (
                      <div key={s.id} className="flex flex-col gap-0.5">
                        <span className="text-xs text-slate-300">{s.student_name}</span>
                        <span className="text-xs font-mono text-slate-400">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </span>
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

      {/* ── Today tab ────────────────────────────────────────────────────── */}
      {activeTab === 'Today' && (
        <div className="animate-fade-in space-y-6">
          {todayLoading ? (
            <p className="text-slate-400 text-sm">Loading today's schedule…</p>
          ) : todayError ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-red-400 text-sm">{todayError}</p>
              <button onClick={loadTodaySummary} className="btn-primary text-sm">Retry</button>
            </div>
          ) : !todaySummary ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-slate-400 text-sm">No data loaded.</p>
              <button onClick={loadTodaySummary} className="btn-primary text-sm">Load</button>
            </div>
          ) : (() => {
            const { bookings, coaching, social } = todaySummary
            const todayLabel = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

            // Group bookings by group_id (one row per unique booking slot per member)
            const bookingGroups = bookings.reduce((acc, b) => {
              const key = `${b.group_id}-${b.start_time}`
              if (!acc[key]) acc[key] = { ...b, members: [] }
              acc[key].members.push({ user_id: b.user_id, user_name: b.user_name, checked_in: b.checked_in })
              return acc
            }, {})

            // Split coaching into individual and grouped
            const individualCoaching = coaching.filter(c => !c.group_id)
            const groupCoachingMap = coaching.filter(c => c.group_id).reduce((acc, c) => {
              if (!acc[c.group_id]) acc[c.group_id] = { ...c, students: [] }
              acc[c.group_id].students.push(c)
              return acc
            }, {})
            const groupCoachingSessions = Object.values(groupCoachingMap)

            // Group social by session id
            const socialGroups = social.reduce((acc, r) => {
              if (!acc[r.id]) acc[r.id] = { ...r, members: [] }
              acc[r.id].members.push({ user_id: r.user_id, user_name: r.user_name, checked_in: r.checked_in })
              return acc
            }, {})

            const noActivity = bookings.length === 0 && coaching.length === 0 && social.length === 0

            const handleCheckIn = async (type, refId, userId) => {
              try {
                if (type === 'booking')  await checkinAPI.adminCheckInBooking(refId, userId)
                if (type === 'coaching') await checkinAPI.adminCheckInCoaching(refId, userId)
                if (type === 'social')   await checkinAPI.adminCheckInSocial(refId, userId)
                loadTodaySummary()
              } catch (err) {
                alert(err.response?.data?.message ?? 'Check-in failed.')
              }
            }

            const Badge = ({ in: checkedIn }) => checkedIn
              ? <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Checked in</span>
              : <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">Not in</span>

            return (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-sm">{todayLabel}</p>
                  <button onClick={loadTodaySummary} className="text-xs text-slate-400 hover:text-white transition-colors">↺ Refresh</button>
                </div>

                {noActivity && (
                  <p className="text-slate-400 text-sm">No activities scheduled for today.</p>
                )}

                {/* ── Bookings ──────────────────────────────────────── */}
                {Object.keys(bookingGroups).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Court Bookings</p>
                    <div className="space-y-3">
                      {Object.values(bookingGroups).map(g => (
                        <div key={g.group_id + g.start_time} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-mono text-slate-300">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</span>
                            <span className="text-xs text-slate-500">{g.court_name}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {g.members.map(m => (
                              <div key={m.user_id} className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                                <span className="text-xs text-white">{m.user_name}</span>
                                <Badge in={m.checked_in} />
                                {!m.checked_in && (
                                  <button
                                    onClick={() => handleCheckIn('booking', g.group_id, m.user_id)}
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                                  >Check in</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Coaching ──────────────────────────────────────── */}
                {coaching.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Coaching Sessions</p>
                    <div className="space-y-3">
                      {/* Individual sessions */}
                      {individualCoaching.map(c => (
                        <div key={c.id} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-mono text-slate-300">{fmtTime(c.start_time)} – {fmtTime(c.end_time)}</span>
                            <span className="text-xs text-slate-500">{c.court_name}</span>
                            <span className="text-xs text-slate-400">Coach: {c.coach_name}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                              <span className="text-xs text-white">{c.student_name}</span>
                              <span className="text-[10px] text-slate-500">student</span>
                              {c.admin_checked_in
                                ? <span className="text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-full font-medium">Admin ✓</span>
                                : <Badge in={c.student_checked_in} />
                              }
                              {!c.admin_checked_in && !c.student_checked_in && (
                                <button
                                  onClick={() => handleCheckIn('coaching', c.id, c.student_id)}
                                  className="text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                                >Check in</button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                              <span className="text-xs text-white">{c.coach_name}</span>
                              <span className="text-[10px] text-slate-500">coach</span>
                              {c.coach_user_id
                                ? <Badge in={c.coach_checked_in} />
                                : <span className="text-[10px] text-slate-500">no account</span>
                              }
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Group sessions */}
                      {groupCoachingSessions.map(g => (
                        <div key={g.group_id} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-mono text-slate-300">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</span>
                            <span className="text-xs text-slate-500">{g.court_name}</span>
                            <span className="text-xs text-slate-400">Coach: {g.coach_name}</span>
                            <span className="text-[10px] bg-teal-500/15 text-teal-400 px-2 py-0.5 rounded-full">Group</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {g.students.map(s => (
                              <div key={s.student_id} className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                                <span className="text-xs text-white">{s.student_name}</span>
                                <span className="text-[10px] text-slate-500">student</span>
                                {s.admin_checked_in
                                  ? <span className="text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-full font-medium">Admin ✓</span>
                                  : <Badge in={s.student_checked_in} />
                                }
                                {!s.admin_checked_in && !s.student_checked_in && (
                                  <button
                                    onClick={() => handleCheckIn('coaching', s.id, s.student_id)}
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                                  >Check in</button>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                              <span className="text-xs text-white">{g.coach_name}</span>
                              <span className="text-[10px] text-slate-500">coach</span>
                              {g.coach_user_id
                                ? <Badge in={g.students.some(s => s.coach_checked_in)} />
                                : <span className="text-[10px] text-slate-500">no account</span>
                              }
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Social play ────────────────────────────────────── */}
                {Object.keys(socialGroups).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Social Play</p>
                    <div className="space-y-3">
                      {Object.values(socialGroups).map(g => (
                        <div key={g.id} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-white text-sm">{g.title}</span>
                            <span className="text-xs font-mono text-slate-300">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {g.members.map(m => (
                              <div key={m.user_id} className="flex items-center gap-2 bg-court-dark rounded-lg px-3 py-1.5">
                                <span className="text-xs text-white">{m.user_name}</span>
                                <Badge in={m.checked_in} />
                                {!m.checked_in && (
                                  <button
                                    onClick={() => handleCheckIn('social', g.id, m.user_id)}
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                                  >Check in</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Members tab ──────────────────────────────────────────────────── */}
      {activeTab === 'Members' && (
        <div className="space-y-4 animate-fade-in">

          {/* Add Member form */}
          {showAddMember && (
            <div className="card">
              <h3 className="text-sm font-normal text-white mb-4">Add Member</h3>
              <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="input text-sm" placeholder="Full name *" value={addMemberForm.name}
                  onChange={e => setAddMemberForm(f => ({ ...f, name: e.target.value }))} required />
                <input className="input text-sm" type="email" placeholder="Email address *" value={addMemberForm.email}
                  onChange={e => setAddMemberForm(f => ({ ...f, email: e.target.value }))} required />
                <input className="input text-sm" type="password" placeholder="Password *" value={addMemberForm.password}
                  onChange={e => setAddMemberForm(f => ({ ...f, password: e.target.value }))} required />
                <input className="input text-sm" type="tel" placeholder="Phone (optional)" value={addMemberForm.phone}
                  onChange={e => setAddMemberForm(f => ({ ...f, phone: e.target.value }))} />
                {addMemberError && <p className="sm:col-span-2 text-xs text-red-400">{addMemberError}</p>}
                <div className="sm:col-span-2 flex gap-3">
                  <button type="submit" className="btn-primary text-sm">Add Member</button>
                  <button type="button" className="btn-secondary text-sm" onClick={() => { setShowAddMember(false); setAddMemberError('') }}>Cancel</button>
                </div>
              </form>
            </div>
          )}

        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-court-light flex items-center gap-3">
            <input
              type="text"
              className="input flex-1 text-sm"
              placeholder="Search by name or email…"
              value={memberListSearch}
              onChange={e => setMemberListSearch(e.target.value)}
            />
            {!showAddMember && (
              <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setShowAddMember(true)}>
                + Add Member
              </button>
            )}
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
                          <div className="flex gap-3 flex-wrap">
                            {m.role === 'admin' ? (
                              <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-sky-400 hover:text-sky-300">Demote</button>
                            ) : m.role === 'coach' ? (
                              <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-sky-400 hover:text-sky-300">Demote</button>
                            ) : (
                              <>
                                <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-sky-400 hover:text-sky-300">Make Admin</button>
                                <button onClick={() => { setCoachModal({ id: m.id, name: m.name }); setCoachForm({ availability_start: '', availability_end: '', bio: '', resume: null }) }} className="text-xs text-emerald-400 hover:text-emerald-300">Make Coach</button>
                              </>
                            )}
                            <button onClick={() => handleRemoveMember(m.id, m.name, m.role)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
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

              // Merge group coaching sessions (same group_id) into one event each
              const coachingEvents = []
              const groupMap = {}
              for (const s of bookingViewSessions) {
                if (s.group_id) {
                  if (!groupMap[s.group_id]) {
                    groupMap[s.group_id] = { ...s, key: `cg-${s.group_id}`, type: 'coaching_group', student_names: [], student_ids: [], session_ids: [] }
                    coachingEvents.push(groupMap[s.group_id])
                  }
                  groupMap[s.group_id].student_names.push(s.student_name)
                  groupMap[s.group_id].student_ids.push(s.student_id)
                  groupMap[s.group_id].session_ids.push(s.id)
                } else {
                  coachingEvents.push({ key: `c-${s.id}`, type: 'coaching', ...s })
                }
              }

              // Build a unified event list (booking / coaching / social)
              const allEvents = [
                ...bookings
                  .filter(b => !search || b.user_name.toLowerCase().includes(search))
                  .map(b => ({ key: `b-${b.booking_group_id}`, type: 'booking', ...b })),
                ...coachingEvents
                  .filter(s => !search || (s.student_names ?? [s.student_name]).some(n => n?.toLowerCase().includes(search))),
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

                      if (ev.type === 'coaching_group') {
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height, left, width }}
                            className="bg-teal-500/15 border border-teal-500/40 rounded-lg px-2.5 py-1.5 overflow-hidden flex flex-col"
                          >
                            <p className="text-teal-300 text-xs truncate leading-none">{ev.student_names.join(', ')}</p>
                            <p className="text-slate-300 text-xs mt-1 leading-none">Coach: {ev.coach_name}</p>
                            <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto">
                              <button
                                onClick={() => handleCancelGroupSession(ev.group_id)}
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
        <div className="animate-fade-in space-y-6">

          {/* ── Sub-tabs ── */}
          <div className="flex gap-1 border-b border-court-light pb-0">
            {[
              { id: 'one-on-one', label: 'One-on-One' },
              { id: 'group',     label: 'Group Coaching' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setCoachingSubTab(t.id)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                  coachingSubTab === t.id
                    ? 'text-white border-brand-500 bg-brand-500/10'
                    : 'text-slate-400 border-transparent hover:text-white hover:border-court-light'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Date picker (shared) ── */}
          <div className="flex gap-2 overflow-x-auto pb-2 items-center">
            {upcomingDates.map(d => {
              const iso      = toISO(d)
              const dowLabel = d.toLocaleDateString('en-AU', { weekday: 'short' })
              const dayLabel = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              const q        = coachingSearch.toLowerCase()
              const hasMatch = q && allCoachingSessions.some(s =>
                s.date?.slice(0, 10) === iso &&
                (s.student_name?.toLowerCase().includes(q) || s.coach_name?.toLowerCase().includes(q))
              )
              return (
                <button key={iso} onClick={() => setCoachingDate(iso)}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all text-center min-w-[72px] ${
                    coachingDate === iso
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : hasMatch
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 hover:border-emerald-400 hover:text-white'
                        : 'border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white'
                  }`}
                >
                  <div>{dowLabel}</div>
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
            {coachingSubTab === 'one-on-one' && (
              <button
                onClick={() => { setShowSessionForm(v => !v); setShowGroupForm(false) }}
                className="btn-primary text-sm flex-shrink-0 ml-auto"
              >
                {showSessionForm ? 'Cancel' : '+ Schedule Session'}
              </button>
            )}
            {coachingSubTab === 'group' && (
              <button
                onClick={() => { setShowGroupForm(v => !v); setShowSessionForm(false) }}
                className="btn-primary text-sm flex-shrink-0 ml-auto"
              >
                {showGroupForm ? 'Cancel' : '+ Schedule Group Session'}
              </button>
            )}
          </div>

          {/* ══════════ ONE-ON-ONE sub-tab ══════════ */}
          {coachingSubTab === 'one-on-one' && (
            <div className="space-y-4">
              {/* Schedule session form */}
              {showSessionForm && (() => {
                const formDow   = sessionForm.date ? new Date(sessionForm.date + 'T12:00:00').getDay() : null
                const formSlots = formDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                const endSlots  = formSlots.filter(s => !sessionForm.start_time || toMins(s) > toMins(sessionForm.start_time))
                return (
                  <div className="card mb-2 space-y-4">
                    <p className="text-xs text-slate-300 uppercase tracking-widest">New One-on-One Session</p>
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
                      <input type="text" className="input w-full" placeholder="Search student name…"
                        value={studentSearch}
                        onChange={e => { setStudentSearch(e.target.value); setSessionForm(f => ({ ...f, student_id: '' })) }}
                      />
                      {studentSearch && (
                        <div className="mt-1 border border-court-light rounded-lg overflow-y-auto max-h-[160px] bg-court">
                          {members
                            .filter(m => m.name.toLowerCase().includes(studentSearch.toLowerCase()) || m.email.toLowerCase().includes(studentSearch.toLowerCase()))
                            .map(m => (
                              <button key={m.id} type="button"
                                onClick={() => { setSessionForm(f => ({ ...f, student_id: String(m.id) })); setStudentSearch(m.name) }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-court-light/40 transition-colors ${String(sessionForm.student_id) === String(m.id) ? 'text-brand-300 bg-court-light/20' : 'text-slate-300'}`}
                              >
                                {m.name}<span className="text-slate-400 text-xs ml-2">{m.email}</span>
                              </button>
                            ))}
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
                      <label className="block text-xs text-slate-200 mb-1">Recurring — N weeks (1 = one-off)</label>
                      <input type="number" min={1} max={52} className="input w-32"
                        value={sessionForm.weeks}
                        onChange={e => setSessionForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Notes (optional)</label>
                      <textarea className="input w-full h-20 resize-none" placeholder="e.g. Focus on backhand technique"
                        value={sessionForm.notes}
                        onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <button onClick={handleCreateSession} className="btn-primary text-sm">
                      Create Session{sessionForm.weeks > 1 ? ` (${sessionForm.weeks} weeks)` : ''}
                    </button>
                  </div>
                )
              })()}

              {/* Name search */}
              <div>
                <input type="text" placeholder="Search by student or coach name…"
                  value={coachingSearch}
                  onChange={e => setCoachingSearch(e.target.value)}
                  className="input text-sm w-full max-w-sm"
                />
              </div>

              {/* Sessions table */}
              {loading ? (
                <p className="text-slate-300 text-sm">Loading sessions…</p>
              ) : coachingSessions.filter(s => !s.group_id).length === 0 ? (
                <p className="text-slate-300 text-sm">No one-on-one sessions on this date.</p>
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
                      {coachingSessions.filter(s => {
                        if (s.group_id) return false
                        const q = coachingSearch.toLowerCase()
                        return !q || s.student_name?.toLowerCase().includes(q) || s.coach_name?.toLowerCase().includes(q)
                      }).map(s => {
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
                            <td className="px-5 py-3 text-slate-400 text-xs max-w-[160px] truncate">{s.notes ?? '—'}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                {checkedIn ? (
                                  <span className="text-xs text-emerald-400">Checked In ✓</span>
                                ) : (
                                  <button onClick={() => handleAdminCheckInCoaching(s.id, s.student_id)}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                                    Check In
                                  </button>
                                )}
                                <button onClick={() => handleOpenReschedule(s)}
                                  className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                                  Reschedule
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════ GROUP COACHING sub-tab ══════════ */}
          {coachingSubTab === 'group' && (
            <div className="space-y-4">
              {/* Group session form */}
              {showGroupForm && (() => {
                const formDow   = groupForm.date ? new Date(groupForm.date + 'T12:00:00').getDay() : null
                const formSlots = formDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                const endSlots  = formSlots.filter(s => !groupForm.start_time || toMins(s) > toMins(groupForm.start_time))
                const selectedStudents = members.filter(m => groupForm.student_ids.includes(m.id))
                const filteredStudents = groupStudentSearch
                  ? members.filter(m =>
                      !groupForm.student_ids.includes(m.id) &&
                      (m.name.toLowerCase().includes(groupStudentSearch.toLowerCase()) ||
                       m.email.toLowerCase().includes(groupStudentSearch.toLowerCase()))
                    )
                  : []
                return (
                  <div className="card mb-2 space-y-4">
                    <p className="text-xs text-slate-300 uppercase tracking-widest">New Group Coaching Session</p>
                    <p className="text-xs text-slate-400">Assign 2–5 students to one coach. They share a single court.</p>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Coach</label>
                      <select className="input w-full" value={groupForm.coach_id}
                        onChange={e => setGroupForm(f => ({ ...f, coach_id: e.target.value }))}>
                        <option value="">Select coach…</option>
                        {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">
                        Students ({selectedStudents.length}/5 selected)
                      </label>
                      {/* Selected chips */}
                      {selectedStudents.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {selectedStudents.map(m => (
                            <span key={m.id} className="flex items-center gap-1 bg-brand-500/20 border border-brand-500/40 text-brand-300 text-xs px-2.5 py-1 rounded-full">
                              {m.name}
                              <button
                                type="button"
                                onClick={() => setGroupForm(f => ({ ...f, student_ids: f.student_ids.filter(id => id !== m.id) }))}
                                className="ml-1 text-brand-400 hover:text-white leading-none"
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Student search */}
                      {selectedStudents.length < 5 && (
                        <input type="text" className="input w-full" placeholder="Search to add a student…"
                          value={groupStudentSearch}
                          onChange={e => setGroupStudentSearch(e.target.value)}
                        />
                      )}
                      {filteredStudents.length > 0 && (
                        <div className="mt-1 border border-court-light rounded-lg overflow-y-auto max-h-[160px] bg-court">
                          {filteredStudents.map(m => (
                            <button key={m.id} type="button"
                              onClick={() => {
                                setGroupForm(f => ({ ...f, student_ids: [...f.student_ids, m.id] }))
                                setGroupStudentSearch('')
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-court-light/40 transition-colors"
                            >
                              {m.name}<span className="text-slate-400 text-xs ml-2">{m.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Date</label>
                      <input type="date" className="input w-full" value={groupForm.date}
                        onChange={e => setGroupForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">Start Time</label>
                        <select className="input w-full" value={groupForm.start_time}
                          onChange={e => setGroupForm(f => ({ ...f, start_time: e.target.value, end_time: '' }))}>
                          <option value="">Select…</option>
                          {formSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">End Time</label>
                        <select className="input w-full" value={groupForm.end_time}
                          onChange={e => setGroupForm(f => ({ ...f, end_time: e.target.value }))}
                          disabled={!groupForm.start_time}>
                          <option value="">Select…</option>
                          {endSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Recurring — N weeks (1 = one-off)</label>
                      <input type="number" min={1} max={52} className="input w-32"
                        value={groupForm.weeks}
                        onChange={e => setGroupForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Notes (optional)</label>
                      <textarea className="input w-full h-20 resize-none" placeholder="e.g. Beginner footwork drills"
                        value={groupForm.notes}
                        onChange={e => setGroupForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>

                    <button onClick={handleCreateGroupSession} className="btn-primary text-sm"
                      disabled={groupForm.student_ids.length < 2}>
                      Create Group Session{groupForm.weeks > 1 ? ` (${groupForm.weeks} weeks)` : ''}
                    </button>
                  </div>
                )
              })()}

              {/* Group sessions table */}
              {loading ? (
                <p className="text-slate-300 text-sm">Loading group sessions…</p>
              ) : groupSessions.length === 0 ? (
                <p className="text-slate-300 text-sm">No group coaching sessions on this date.</p>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-court-light">
                        {['Students', 'Coach', 'Time', 'Court', 'Notes', 'Actions'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupSessions.map(g => (
                        <React.Fragment key={g.group_id}>
                          <tr className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap gap-1">
                                {g.student_names.map((name, i) => (
                                  <span key={i} className="bg-brand-500/15 text-brand-300 text-xs px-2 py-0.5 rounded-full">{name}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-slate-300">{g.coach_name}</td>
                            <td className="px-5 py-3 text-slate-300 text-xs font-mono whitespace-nowrap">
                              {fmtTime(g.start_time)} – {fmtTime(g.end_time)}
                            </td>
                            <td className="px-5 py-3 text-slate-400 text-xs">{g.court_name}</td>
                            <td className="px-5 py-3 text-slate-400 text-xs max-w-[140px] truncate">{g.notes ?? '—'}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    if (rescheduleGroupId === g.group_id) {
                                      setRescheduleGroupId(null)
                                    } else {
                                      setRescheduleGroupId(g.group_id)
                                      setRescheduleGroupForm({ date: '', start_time: '', end_time: '' })
                                    }
                                  }}
                                  className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                                  {rescheduleGroupId === g.group_id ? 'Close' : 'Reschedule'}
                                </button>
                                <button onClick={() => handleCancelGroupSession(g.group_id)}
                                  className="text-xs text-red-400 hover:text-red-300 font-medium">
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                          {rescheduleGroupId === g.group_id && (
                            <tr className="border-b border-court-light/50 bg-court-light/10">
                              <td colSpan={6} className="px-5 py-4">
                                {(() => {
                                  const rDow = rescheduleGroupForm.date ? new Date(rescheduleGroupForm.date + 'T12:00:00').getDay() : null
                                  const rSlots = rDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                                  return (
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">New Date</label>
                                    <input type="date" className="input text-sm"
                                      value={rescheduleGroupForm.date}
                                      onChange={e => setRescheduleGroupForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                                    <select className="input text-sm" value={rescheduleGroupForm.start_time}
                                      onChange={e => setRescheduleGroupForm(f => ({ ...f, start_time: e.target.value, end_time: '' }))}>
                                      <option value="">Keep current</option>
                                      {rSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">End Time</label>
                                    <select className="input text-sm" value={rescheduleGroupForm.end_time}
                                      onChange={e => setRescheduleGroupForm(f => ({ ...f, end_time: e.target.value }))}
                                      disabled={!rescheduleGroupForm.start_time}>
                                      <option value="">Keep current</option>
                                      {(rescheduleGroupForm.start_time
                                        ? rSlots.filter(s => s > rescheduleGroupForm.start_time)
                                        : rSlots
                                      ).map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                                    </select>
                                  </div>
                                  <button onClick={handleRescheduleGroupSession}
                                    disabled={!rescheduleGroupForm.date}
                                    className="btn-primary text-sm disabled:opacity-50">
                                    Confirm
                                  </button>
                                </div>
                                  )
                                })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Pay Report tab ───────────────────────────────────────────────── */}
      {activeTab === 'Pay Report' && (
        <div className="animate-fade-in space-y-6">
          <p className="text-xs text-slate-300">
            A session counts toward pay when <span className="text-white">an admin checks in</span>, or when <span className="text-white">both the student and the coach</span> have self-checked in.
          </p>

          {/* Date range picker */}
          <div className="card">
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
                      {weeks.map(week => (
                        <div key={week.weekStart}>
                          <div className="flex items-center justify-between px-5 py-2 bg-court-light/10 border-b border-court-light/40">
                            <p className="text-xs text-slate-400">
                              Week of {new Date(week.weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-xs text-slate-500">
                              <span className="text-emerald-400">{week.counted}</span>{' '}/ {week.total} counted
                            </p>
                          </div>
                          <table className="w-full text-sm">
                            <tbody>
                              {week.sessions.map(s => (
                                <tr key={s.session_id} className={`border-b border-court-light/30 last:border-0 ${s.counted ? '' : 'opacity-50'}`}>
                                  <td className="px-5 py-2.5 text-slate-300 text-xs whitespace-nowrap">
                                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  </td>
                                  <td className="px-5 py-2.5 text-white text-xs">
                                    {s.student_name}
                                    {s.is_group && <span className="ml-1.5 text-[10px] bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded-full">Group</span>}
                                  </td>
                                  <td className="px-5 py-2.5 text-slate-300 text-xs font-mono whitespace-nowrap">
                                    {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                    {s.admin_checked_in ? (
                                      <span className="text-sky-400">Admin ✓</span>
                                    ) : (
                                      <span className="space-x-2">
                                        <span className={s.student_checked_in ? 'text-emerald-400' : 'text-red-400'}>
                                          Student {s.student_checked_in ? '✓' : '✗'}
                                        </span>
                                        <span className={s.coach_checked_in === null ? 'text-slate-400' : s.coach_checked_in ? 'text-emerald-400' : 'text-red-400'}>
                                          {s.coach_checked_in === null ? 'Coach N/A' : `Coach ${s.coach_checked_in ? '✓' : '✗'}`}
                                        </span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs">
                                    {s.counted ? <span className="text-emerald-400">Counted</span> : <span className="text-slate-400">Not counted</span>}
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
        </div>
      )}

      {/* ── Social Play tab ──────────────────────────────────────────────── */}
      {activeTab === 'Social Play' && (
        <div className="animate-fade-in space-y-8">

          {/* Create session button + form */}
          <div>
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

                {(() => {
                  const dow = socialForm.date ? new Date(socialForm.date + 'T12:00:00').getDay() : null
                  const slots = OPEN_DAYS.find(d => d.dow === dow)?.slots ?? WEEKDAY_SLOTS
                  // end-time options: every slot after the selected start, plus a closing slot
                  const lastSlot = slots[slots.length - 1]
                  const [lh, lm] = lastSlot.split(':').map(Number)
                  const closingSlot = `${String(lh + (lm === 30 ? 1 : 0)).padStart(2,'0')}:${lm === 30 ? '00' : '30'}`
                  const endSlots = [...slots.slice(1), closingSlot]
                  const startIdx = slots.indexOf(socialForm.start_time)
                  const validEndSlots = startIdx >= 0 ? endSlots.slice(startIdx) : endSlots
                  return (
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">Start Time</label>
                        <select
                          className="input w-full"
                          value={socialForm.start_time}
                          onChange={e => setSocialForm(f => ({ ...f, start_time: e.target.value, end_time: '' }))}
                        >
                          <option value="">-- select --</option>
                          {slots.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">End Time</label>
                        <select
                          className="input w-full"
                          value={socialForm.end_time}
                          onChange={e => setSocialForm(f => ({ ...f, end_time: e.target.value }))}
                          disabled={!socialForm.start_time}
                        >
                          <option value="">-- select --</option>
                          {validEndSlots.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  )
                })()}

                <div className="flex gap-4 items-end">
                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Max Players</label>
                    <input
                      type="number" min={2} max={50} className="input w-32"
                      value={socialForm.max_players}
                      onChange={e => setSocialForm(f => ({ ...f, max_players: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-200 mb-1">Repeat (weeks)</label>
                    <input
                      type="number" min={1} max={52} className="input w-24"
                      value={socialForm.weeks}
                      onChange={e => setSocialForm(f => ({ ...f, weeks: e.target.value }))}
                    />
                  </div>
                </div>

                <button onClick={handleCreateSocialSession} className="btn-primary text-sm">
                  {Number(socialForm.weeks) > 1 ? `Open ${socialForm.weeks} Sessions` : 'Open Session'}
                </button>
              </div>
            )}
          </div>

          {/* Date filter */}
          {!loading && (
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-slate-400">Filter by date</label>
              <input
                type="date"
                value={socialDateFilter}
                onChange={e => { setSocialDateFilter(e.target.value); setSocialPage(0) }}
                className="input text-sm px-3 py-1.5"
              />
              {socialDateFilter && (
                <button
                  onClick={() => { setSocialDateFilter(''); setSocialPage(0) }}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setShowSocialForm(v => !v)}
                className="btn-primary text-sm ml-auto"
              >
                {showSocialForm ? 'Cancel' : '+ Open a Slot'}
              </button>
            </div>
          )}

          {/* Name search */}
          {!loading && (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by participant name…"
                value={socialSearch}
                onChange={e => { setSocialSearch(e.target.value); setSocialPage(0) }}
                className="input text-sm w-full max-w-sm"
              />
            </div>
          )}

          {/* Sessions list */}
          {(() => {
            const filtered = socialSessions
              .filter(s => !socialDateFilter || s.date?.slice(0, 10) === socialDateFilter)
              .filter(s => {
                const q = socialSearch.toLowerCase()
                return !q || s.participants?.some(p => p.name?.toLowerCase().includes(q)) || s.title?.toLowerCase().includes(q)
              })
            const totalPages = Math.ceil(filtered.length / 3)
            const pageSlice  = filtered.slice(socialPage * 3, socialPage * 3 + 3)
            return loading ? (
              <p className="text-slate-300 text-sm">Loading sessions…</p>
            ) : filtered.length === 0 ? (
              <p className="text-slate-300 text-sm">{socialDateFilter ? 'No sessions on this date.' : 'No upcoming social play sessions.'}</p>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pageSlice.map(s => {
                const timeEdit = editingTimes[s.id]
                return (
                  <div key={s.id} className="card flex flex-col gap-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white text-base">{s.title}</p>
                          {s.recurrence_id && (
                            <span className="text-[10px] uppercase tracking-widest text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full font-medium">
                              Recurring
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5 font-medium">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        {s.description && (
                          <p className="text-sm text-slate-300 mt-1">{s.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleCancelSocialSession(s.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium"
                        >
                          Cancel
                        </button>
                        {s.recurrence_id && (
                          <button
                            onClick={() => handleCancelSocialSeries(s.recurrence_id)}
                            className="text-xs text-orange-400 hover:text-orange-300 font-medium whitespace-nowrap"
                          >
                            Cancel Series
                          </button>
                        )}
                      </div>
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
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-court-light text-slate-100 rounded-full pl-2.5 pr-1.5 py-0.5 font-medium">
                              {p.name}
                              <button
                                onClick={() => handleSocialRemoveMember(s.id, p.id)}
                                className="text-slate-400 hover:text-red-400 leading-none transition-colors"
                                title="Remove"
                              >✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Add member */}
                      {s.participant_count < s.max_players && (() => {
                        const existingIds = new Set(s.participants.map(p => p.id))
                        const picker = addingMember[s.id] ?? { query: '', userId: '' }
                        const suggestions = picker.query.length > 0
                          ? members.filter(m => !existingIds.has(m.id) && m.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6)
                          : []
                        return (
                          <div className="mt-2 relative">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Type name to add…"
                                className="input text-xs py-1 px-2 flex-1"
                                value={picker.query}
                                onChange={e => setAddingMember(prev => ({ ...prev, [s.id]: { query: e.target.value, userId: '' } }))}
                              />
                              {picker.userId && (
                                <button
                                  onClick={() => handleSocialAddMember(s.id, picker.userId)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium whitespace-nowrap"
                                >Add</button>
                              )}
                            </div>
                            {suggestions.length > 0 && (
                              <div className="absolute z-10 left-0 right-0 mt-1 bg-court-dark border border-court-light rounded-lg shadow-lg overflow-hidden">
                                {suggestions.map(m => (
                                  <button
                                    key={m.id}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-court-light transition-colors"
                                    onClick={() => setAddingMember(prev => ({ ...prev, [s.id]: { query: m.name, userId: m.id } }))}
                                  >{m.name}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                  )
                })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                      onClick={() => setSocialPage(p => Math.max(0, p - 1))}
                      disabled={socialPage === 0}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-court-light text-slate-300 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-slate-400">{socialPage + 1} / {totalPages}</span>
                    <button
                      onClick={() => setSocialPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={socialPage === totalPages - 1}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-court-light text-slate-300 hover:border-brand-500/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      )}

      {/* ── Analytics tab ────────────────────────────────────────────────── */}
      {activeTab === 'Analytics' && (
        <div className="animate-fade-in space-y-8">
          {analyticsLoading ? (
            <p className="text-slate-400 text-sm">Loading analytics…</p>
          ) : !analyticsData ? null : (() => {
            const { memberGrowth, slotPopularity, attendance } = analyticsData

            // ── Slot heatmap ─────────────────────────────────────────────────
            const DAYS_ORDER = [1,2,3,4,5,6,0]
            const DAY_LABELS  = { 0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat' }
            const allSlots = [...new Set(slotPopularity.map(r => r.slot))].sort()
            const heatmapMax = Math.max(...slotPopularity.map(r => r.count), 1)

            // ── Attendance filtered list ─────────────────────────────────────
            const filteredAttendance = attendance
              .filter(m => {
                if (attendanceFilter === 'active')   return m.total_activities > 0
                if (attendanceFilter === 'inactive') return m.total_activities === 0
                return true
              })
              .filter(m => !attendanceSearch || m.name.toLowerCase().includes(attendanceSearch.toLowerCase()) || m.email.toLowerCase().includes(attendanceSearch.toLowerCase()))

            const popularSlot  = [...slotPopularity].sort((a,b) => b.count - a.count)[0]
            const unpopularSlot = [...slotPopularity].filter(r => r.count > 0).sort((a,b) => a.count - b.count)[0]
            const totalMembers = attendance.length
            const activeCount  = attendance.filter(m => m.total_activities > 0).length

            return (
              <>
                {/* ── Summary cards ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Members', value: totalMembers, color: 'text-brand-400' },
                    { label: 'Active Members', value: activeCount, color: 'text-emerald-400' },
                    { label: 'Never Active', value: totalMembers - activeCount, color: 'text-red-400' },
                    { label: 'Busiest Slot', value: popularSlot ? `${DAY_LABELS[popularSlot.dow]} ${fmtTime(popularSlot.slot + ':00')}` : '—', color: 'text-yellow-400' },
                  ].map(c => (
                    <div key={c.label} className="card text-center py-5">
                      <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Member growth chart ────────────────────────────────── */}
                <div className="card">
                  <p className="text-sm text-white mb-4">New Members — Last 12 Weeks</p>
                  {memberGrowth.length === 0 ? (
                    <p className="text-slate-400 text-xs">No data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={memberGrowth} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="week" tickFormatter={w => w.slice(5)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                          labelFormatter={w => `Week of ${w}`}
                          formatter={v => [v, 'New members']}
                        />
                        <Line type="monotone" dataKey="new_members" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* ── Slot popularity heatmap ────────────────────────────── */}
                <div className="card overflow-x-auto">
                  <p className="text-sm text-white mb-4">Activity by Day &amp; Time Slot</p>
                  {slotPopularity.length === 0 ? (
                    <p className="text-slate-400 text-xs">No activity data yet.</p>
                  ) : (
                    <table className="text-xs w-full min-w-[400px]">
                      <thead>
                        <tr>
                          <th className="text-left text-slate-400 pr-3 py-1 font-normal w-12">Time</th>
                          {DAYS_ORDER.map(d => (
                            <th key={d} className="text-slate-400 font-normal py-1 text-center w-12">{DAY_LABELS[d]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allSlots.map(slot => (
                          <tr key={slot}>
                            <td className="text-slate-400 pr-3 py-0.5 font-mono">{fmtTime(slot + ':00')}</td>
                            {DAYS_ORDER.map(d => {
                              const cell = slotPopularity.find(r => r.dow === d && r.slot === slot)
                              const count = cell?.count ?? 0
                              const intensity = count / heatmapMax
                              const bg = count === 0
                                ? 'bg-court-dark'
                                : intensity > 0.66 ? 'bg-brand-500'
                                : intensity > 0.33 ? 'bg-brand-500/50'
                                : 'bg-brand-500/20'
                              return (
                                <td key={d} className="py-0.5 text-center">
                                  <div
                                    className={`mx-auto w-9 h-7 rounded flex items-center justify-center text-[10px] font-medium ${bg} ${count > 0 ? 'text-white' : 'text-slate-600'}`}
                                    title={count > 0 ? `${DAY_LABELS[d]} ${slot} — ${count} activities` : ''}
                                  >
                                    {count > 0 ? count : ''}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Member attendance ──────────────────────────────────── */}
                <div className="card">
                  <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                    <p className="text-sm text-white">Member Attendance</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search name or email…"
                        className="input text-xs py-1.5 px-3 w-48"
                        value={attendanceSearch}
                        onChange={e => setAttendanceSearch(e.target.value)}
                      />
                      {['all', 'active', 'inactive'].map(f => (
                        <button
                          key={f}
                          onClick={() => setAttendanceFilter(f)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${attendanceFilter === f ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-court-light text-slate-400 hover:text-white'}`}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-court-light">
                          {['Member', 'Joined', 'Activities', 'Last Active', 'Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs text-slate-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAttendance.length === 0 ? (
                          <tr><td colSpan={5} className="text-center text-slate-400 text-xs py-6">No members found.</td></tr>
                        ) : filteredAttendance.map(m => (
                          <tr key={m.id} className="border-b border-court-light/30 last:border-0 hover:bg-court-light/10 transition-colors">
                            <td className="px-3 py-3">
                              <p className="text-white text-xs font-medium">{m.name}</p>
                              <p className="text-slate-500 text-[10px]">{m.email}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">
                              {new Date(m.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-sm font-bold ${m.total_activities > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {m.total_activities}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">
                              {m.last_active
                                ? new Date(m.last_active + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.total_activities > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                {m.total_activities > 0 ? 'Active' : 'Never Active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── Make Coach Modal ──────────────────────────────────────────────── */}
      {coachModal && (() => {
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-court-mid border border-court-light rounded-xl w-full max-w-md p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-white">Make Coach — {coachModal.name}</h2>
                <button onClick={() => setCoachModal(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* Start / End dates (both optional) */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Start Date (optional)</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={coachForm.availability_start}
                    onChange={e => setCoachForm(f => ({ ...f, availability_start: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">End Date (optional)</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={coachForm.availability_end}
                    min={coachForm.availability_start || undefined}
                    onChange={e => setCoachForm(f => ({ ...f, availability_end: e.target.value }))}
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bio (optional)</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  placeholder="Short coach bio…"
                  value={coachForm.bio}
                  onChange={e => setCoachForm(f => ({ ...f, bio: e.target.value }))}
                />
              </div>

              {/* Resume drag-and-drop */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Resume (PDF, optional)</label>
                <div
                  onDragOver={e => { e.preventDefault(); setCoachDragging(true) }}
                  onDragLeave={() => setCoachDragging(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setCoachDragging(false)
                    const file = e.dataTransfer.files[0]
                    if (file && file.type === 'application/pdf') setCoachForm(f => ({ ...f, resume: file }))
                    else alert('Please drop a PDF file.')
                  }}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    coachDragging ? 'border-brand-400 bg-brand-500/10' : 'border-court-light hover:border-slate-500'
                  }`}
                  onClick={() => document.getElementById('coach-resume-input').click()}
                >
                  {coachForm.resume ? (
                    <p className="text-sm text-emerald-400">{coachForm.resume.name}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Drag & drop a PDF here, or click to browse</p>
                  )}
                  <input
                    id="coach-resume-input"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => { if (e.target.files[0]) setCoachForm(f => ({ ...f, resume: e.target.files[0] })) }}
                  />
                </div>
                {coachForm.resume && (
                  <button className="text-xs text-red-400 hover:text-red-300 mt-1" onClick={() => setCoachForm(f => ({ ...f, resume: null }))}>Remove file</button>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setCoachModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleMakeCoachSubmit} disabled={coachSubmitting} className="btn-primary flex-1">
                  {coachSubmitting ? 'Saving…' : 'Make Coach'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Reschedule Sessions Modal ─────────────────────────────────────── */}
      {rescheduleModal && (() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const allSlots = [...WEEKDAY_SLOTS, ...SATURDAY_SLOTS].filter((v, i, a) => a.indexOf(v) === i).sort()
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-court-mid border border-court-light rounded-xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white">Reschedule Sessions</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{rescheduleModal.studentName}</p>
                </div>
                <button onClick={() => setRescheduleModal(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* Optional new time for "Move from here" */}
              <div className="bg-court-light/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-slate-400">New time for remaining sessions (optional — leave blank to keep current time)</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">Start time</label>
                    <select className="input w-full text-sm" value={rescheduleTime.start_time}
                      onChange={e => setRescheduleTime(f => ({
                        ...f,
                        start_time: e.target.value,
                        end_time: f.end_time && toMins(f.end_time) > toMins(e.target.value) ? f.end_time : '',
                      }))}>
                      <option value="">— keep current —</option>
                      {allSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">End time</label>
                    <select className="input w-full text-sm" value={rescheduleTime.end_time}
                      onChange={e => setRescheduleTime(f => ({ ...f, end_time: e.target.value }))}
                      disabled={!rescheduleTime.start_time}>
                      <option value="">— keep current —</option>
                      {allSlots.filter(s => !rescheduleTime.start_time || toMins(s) > toMins(rescheduleTime.start_time))
                        .map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Session list */}
              <div className="overflow-y-auto flex-1 -mx-2 px-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-court-light">
                      {['#', 'Current Date', 'Time', 'New Date', 'Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rescheduleModal.sessions.map((s, i) => {
                      const isPast    = s.date?.slice(0, 10) < todayISO
                      const newDate   = rescheduleDates[s.id] ?? ''
                      return (
                        <tr key={s.id} className={`border-b border-court-light/40 last:border-0 ${isPast ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="text-white text-xs font-medium">
                              {new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs font-mono whitespace-nowrap">
                            {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                          </td>
                          <td className="px-3 py-2.5">
                            {!isPast && (
                              <input type="date" className="input text-xs px-2 py-1 w-36"
                                value={newDate}
                                min={todayISO}
                                onChange={e => setRescheduleDates(prev => ({ ...prev, [s.id]: e.target.value }))} />
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {!isPast && (
                              <div className="flex flex-col gap-1">
                                <button
                                  disabled={rescheduleSaving}
                                  onClick={() => handleMoveSingle(s.id)}
                                  className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-30 whitespace-nowrap"
                                >
                                  Move this
                                </button>
                                <button
                                  disabled={!newDate || rescheduleSaving}
                                  onClick={() => handleMoveFromHere(s.id)}
                                  className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-30 whitespace-nowrap"
                                >
                                  Move this + rest
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-1 border-t border-court-light">
                <button onClick={() => setRescheduleModal(null)} className="btn-secondary text-sm">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
