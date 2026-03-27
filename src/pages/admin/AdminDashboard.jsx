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

const TIMES = Array.from({ length: 37 }, (_, i) => {
  const h = Math.floor(i / 2) + 6
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}) // 06:00 – 23:30 in 30-min steps

// Returns the first date on or after `isoDate` that falls on `targetDow` (0=Sun…6=Sat).
function nextOccurrence(isoDate, targetDow) {
  const d = new Date(isoDate + 'T12:00:00')
  const diff = (targetDow - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return toISO(d)
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

const WEEKDAY_SLOTS  = ['15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30']
const SATURDAY_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30']
const ALL_SLOTS = [...new Set([...SATURDAY_SLOTS, ...WEEKDAY_SLOTS])].sort()

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
  const [memberModal,  setMemberModal]  = useState(null) // { member, bookings, coaching, social, coachSessions, hoursBalance } | null
  const [memberModalLoading, setMemberModalLoading] = useState(false)
  const [memberModalEditId,   setMemberModalEditId]   = useState(null) // coaching session id being inline-edited
  const [memberModalEditForm, setMemberModalEditForm] = useState({ date: '', start_time: '', end_time: '' })
  const [memberModalEditSaving, setMemberModalEditSaving] = useState(false)
  const [memberModalSelected, setMemberModalSelected] = useState(new Set()) // ids selected for bulk edit
  const [memberModalBulkForm, setMemberModalBulkForm] = useState({ offsetDays: '0', start_time: '', end_time: '' })
  const [memberModalTab,      setMemberModalTab]      = useState('upcoming') // 'upcoming' | 'past'
  const [memberModalCoachingExpanded, setMemberModalCoachingExpanded] = useState(false)
  const [memberModalGroupExpanded, setMemberModalGroupExpanded] = useState(false)
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
  const [sessionSaved,     setSessionSaved]     = useState(false)
  const [rescheduleModal,    setRescheduleModal]    = useState(null) // { studentName, sessions }
  const [rescheduleDates,    setRescheduleDates]    = useState({})  // { [id]: 'YYYY-MM-DD' }
  const [rescheduleTime,     setRescheduleTime]     = useState({ start_time: '', end_time: '' })
  const [rescheduleSaving,   setRescheduleSaving]   = useState(false)
  const [rescheduleSelected, setRescheduleSelected] = useState(new Set()) // session ids checked for bulk move
  const [coachingEditId,   setCoachingEditId]   = useState(null)
  const [coachingEditForm, setCoachingEditForm] = useState({ date: '', start_time: '', end_time: '' })
  const [coachingEditSaving, setCoachingEditSaving] = useState(false)
const [sessionForm,      setSessionForm]      = useState({
    coach_id: '', student_id: '',
    date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10,
  })
  const [studentSearch,    setStudentSearch]    = useState('')
  const [coachingSearch,   setCoachingSearch]   = useState('')
  // Group coaching
  const [coachingSubTab,   setCoachingSubTab]   = useState('one-on-one')
  const [groupSessions,    setGroupSessions]    = useState([])
  const [showGroupForm,    setShowGroupForm]    = useState(false)
  const [groupStudentSearch, setGroupStudentSearch] = useState('')
  const [groupForm,        setGroupForm]        = useState({
    coach_id: '', student_ids: [], date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10,
  })
  const [rescheduleGroupId,   setRescheduleGroupId]   = useState(null)
  const [rescheduleGroupForm, setRescheduleGroupForm] = useState({ date: '', start_time: '', end_time: '' })
  const [addStudentGroupId,   setAddStudentGroupId]   = useState(null)
  const [addStudentSearch,    setAddStudentSearch]    = useState('')
  const [addStudentSaving,    setAddStudentSaving]    = useState(false)
  const [soloEditModal,       setSoloEditModal]       = useState(null) // representative solo session
  const [soloEditSelected,    setSoloEditSelected]    = useState(new Set()) // selected session IDs for bulk cancel
  const [groupEditModal,      setGroupEditModal]      = useState(null) // group object
  const [groupEditAddSearch,  setGroupEditAddSearch]  = useState('')
  const [groupEditAddSaving,  setGroupEditAddSaving]  = useState(false)
  const [dateAddSearch,       setDateAddSearch]       = useState({}) // { date → search string }
  const [dateAddSaving,       setDateAddSaving]       = useState(false)
  const [groupEditSessionDate, setGroupEditSessionDate] = useState(null) // date string being inline-edited
  const [groupEditSelected,   setGroupEditSelected]   = useState(new Set()) // selected date strings for bulk cancel
  const [groupEditForm,       setGroupEditForm]       = useState({ date: '', start_time: '', end_time: '' })
  const [groupEditSaving,     setGroupEditSaving]     = useState(false)
  const [coachViewModal,        setCoachViewModal]        = useState(null) // { coach_id, coach_name, email, phone }
  const [coachViewExpanded,     setCoachViewExpanded]     = useState(new Set()) // Set of group_ids / student_ids
  const [coachSeriesExpanded,   setCoachSeriesExpanded]   = useState(new Set()) // series keys expanded in coach modal
  const [coachViewSelectedDate, setCoachViewSelectedDate] = useState({})        // groupId → selected date string
  const [expandedCoachMemberId, setExpandedCoachMemberId] = useState(null) // member id of expanded coach row
  const [coachRowExpanded,      setCoachRowExpanded]      = useState(new Set()) // student_ids expanded inside inline coach row
  // Coaching hours
  const [hoursStudentSearch, setHoursStudentSearch] = useState('')
  const [hoursTarget,        setHoursTarget]        = useState(null)  // { user_id, name, balance, ledger }
  const [hoursLoading,       setHoursLoading]       = useState(false)
  const [hoursForm,          setHoursForm]          = useState({ delta: '', note: '', session_type: 'solo' })
  // Hours balance shown inline when scheduling sessions
  const [sessionStudentBalance, setSessionStudentBalance] = useState(null)   // number | null
  const [groupStudentBalances,  setGroupStudentBalances]  = useState({})     // { [userId]: number }
  // Hours balances for all students visible in the session tables
  const [sessionBalances,       setSessionBalances]       = useState({})     // { [userId]: number }
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
  const [todayDate,       setTodayDate]       = useState(() => new Date().toISOString().slice(0, 10))
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
  const [editingTimes,   setEditingTimes]   = useState({})
  // { [sessionId]: { title, max_players, date } } — open when admin is editing session details
  const [editingDetails, setEditingDetails] = useState({})
  const [calendarReschedule, setCalendarReschedule] = useState(null) // { type:'solo'|'group', ev, newDate, saving }
  const [socialCalendarEdit, setSocialCalendarEdit] = useState(null) // { id, title, num_courts, max_players, date, start_time, end_time, saving }
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
    Promise.allSettled([
      adminAPI.getAllMembers(),
      coachingAPI.getCoaches(),
      coachingAPI.getSessions({}),
    ])
      .then(([mr, cr, ar]) => {
        if (cancelled) return
        if (mr.status === 'fulfilled') setMembers(mr.value.data.members)
        if (cr.status === 'fulfilled') setCoaches(cr.value.data.coaches)
        if (ar.status === 'fulfilled') setAllCoachingSessions(ar.value.data.sessions)
      })
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
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update role. Please try again.')
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
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not remove member. Please try again.')
    }
  }

  const handleOpenMemberModal = async (memberId) => {
    setMemberModal({ member: members.find(m => m.id === memberId) ?? { id: memberId }, bookings: [], coaching: [], social: [], coachSessions: [], soloBalance: 0, groupBalance: 0, error: null })
    setMemberModalTab('upcoming')
    setMemberModalSelected(new Set())
    setMemberModalEditId(null)
    setMemberModalCoachingExpanded(false)
    setMemberModalGroupExpanded(false)
    setMemberModalLoading(true)
    try {
      const { data } = await adminAPI.getMemberActivities(memberId)
      setMemberModal({ ...data, error: null })
    } catch (err) {
      setMemberModal(prev => ({ ...prev, error: err.response?.data?.message ?? 'Could not load activities.' }))
    } finally {
      setMemberModalLoading(false)
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
      if (type === 'coaching') setAdminCheckedIn(prev => new Set([...prev, refId]))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not check in.')
    }
  }

  const handleAdminUndoCheckIn = async (type, refId, userId) => {
    try {
      await checkinAPI.cancelCheckIn(type, String(refId), userId)
      setAdminCheckIns(prev =>
        prev.filter(ci => !(ci.type === type && ci.reference_id === String(refId) && ci.user_id === userId))
      )
      if (type === 'coaching') setAdminCheckedIn(prev => { const n = new Set(prev); n.delete(refId); return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not undo check-in.')
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
          if (sr.status === 'fulfilled') {
            const sessions = sr.value.data.sessions
            setCoachingSessions(sessions)
            setAdminCheckedIn(new Set(sessions.filter(s => s.checked_in).map(s => s.id)))
          }
          if (ar.status === 'fulfilled') setAllCoachingSessions(ar.value.data.sessions)
          if (mr.status === 'fulfilled' && members.length === 0) setMembers(mr.value.data.members)
          if (gr.status === 'fulfilled') setGroupSessions(gr.value.data.groups)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, coachingDate])

  // When coaching sessions change, bulk-fetch hours balances for all students shown
  useEffect(() => {
    const ids = [...new Set([
      ...coachingSessions.map(s => s.student_id),
      ...groupSessions.flatMap(g => g.student_ids || []),
    ])].filter(Boolean)
    if (!ids.length) return
    let cancelled = false
    Promise.allSettled(ids.map(id => coachingAPI.getHoursBalance(id).then(r => ({ id, solo: r.data.soloBalance, group: r.data.groupBalance }))))
      .then(results => {
        if (cancelled) return
        const map = {}
        results.forEach(r => { if (r.status === 'fulfilled') map[r.value.id] = { solo: r.value.solo, group: r.value.group } })
        setSessionBalances(map)
      })
    return () => { cancelled = true }
  }, [coachingSessions, groupSessions])

  // Fetch social play sessions when Social Play tab is active or date filter changes
  useEffect(() => {
    if (activeTab !== 'Social Play') return
    let cancelled = false
    setLoading(true)
    const params = socialDateFilter ? { date: socialDateFilter } : {}
    const membersFetch = members.length === 0 ? adminAPI.getAllMembers() : Promise.resolve({ data: { members } })
    Promise.all([socialAPI.getAdminSessions(params), membersFetch])
      .then(([{ data: sd }, { data: md }]) => {
        if (!cancelled) {
          setSocialSessions(sd.sessions)
          if (members.length === 0) setMembers(md.members)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, socialDateFilter])

  const loadTodaySummary = (date) => {
    setTodayLoading(true)
    setTodayError(null)
    checkinAPI.getTodaySummary({ date })
      .then(({ data }) => setTodaySummary(data))
      .catch(err => setTodayError(err.response?.data?.message ?? 'Failed to load summary.'))
      .finally(() => setTodayLoading(false))
  }

  // Fetch today summary when Today tab is active or date changes
  useEffect(() => {
    if (activeTab !== 'Today') return
    loadTodaySummary(todayDate)
  }, [activeTab, todayDate])

  // Fetch analytics when Analytics tab is active
  useEffect(() => {
    if (activeTab !== 'Pay Report' || !payReport) return
    // Auto-refresh when admin returns to Pay Report tab so check-ins are reflected
    coachingAPI.getPaymentReport(payFrom, payTo)
      .then(({ data }) => setPayReport(data.coaches))
      .catch(() => {})
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSaveDetails = async (id) => {
    const edits = editingDetails[id]
    if (!edits) return
    try {
      const { data } = await socialAPI.updateSession(id, {
        title:       edits.title,
        max_players: Number(edits.max_players),
        date:        edits.date,
      })
      setSocialSessions(prev => prev.map(s => s.id === id ? { ...s, ...data.session } : s))
      setEditingDetails(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update session.')
    }
  }

  const handleSocialCalendarEditSave = async () => {
    const e = socialCalendarEdit
    if (!e) return
    setSocialCalendarEdit(prev => ({ ...prev, saving: true }))
    try {
      const { data } = await socialAPI.updateSession(e.id, {
        title:       e.title,
        num_courts:  Number(e.num_courts),
        max_players: Number(e.max_players),
        date:        e.date,
        start_time:  e.start_time,
        end_time:    e.end_time,
      })
      setSocialSessions(prev => prev.map(s => s.id === e.id ? { ...s, ...data.session } : s))
      setBookingViewSocialSessions(prev => prev.map(s => s.id === e.id ? { ...s, ...data.session } : s))
      setSocialCalendarEdit(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update session.')
      setSocialCalendarEdit(prev => ({ ...prev, saving: false }))
    }
  }

  const refreshSocialSessions = async () => {
    const params = socialDateFilter ? { date: socialDateFilter } : {}
    const { data } = await socialAPI.getAdminSessions(params)
    setSocialSessions(data.sessions)
  }

  const handleSocialAddWalkin = async (sessionId) => {
    // Optimistic: increment walk-in count immediately
    setSocialSessions(prev => prev.map(s => s.id === sessionId
      ? { ...s, walkin_count: (s.walkin_count ?? 0) + 1, participant_count: s.participant_count + 1 }
      : s
    ))
    try {
      await socialAPI.adminAddWalkin(sessionId)
      await refreshSocialSessions()
    } catch (err) {
      // Revert on failure
      setSocialSessions(prev => prev.map(s => s.id === sessionId
        ? { ...s, walkin_count: Math.max(0, (s.walkin_count ?? 1) - 1), participant_count: Math.max(0, s.participant_count - 1) }
        : s
      ))
      alert(err.response?.data?.message ?? 'Could not add walk-in.')
    }
  }

  const handleSocialAddMember = async (sessionId, userId) => {
    if (!userId) return
    try {
      await socialAPI.adminAddMember(sessionId, userId)
      await refreshSocialSessions()
      setAddingMember(prev => { const n = { ...prev }; delete n[sessionId]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add member.')
    }
  }

  const handleSocialRemoveMember = async (sessionId, userId) => {
    // Optimistic update
    setSocialSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s
      const removed = s.participants.find(p => p.id === userId)
      const isWalkin = removed?.is_walkin ?? false
      return {
        ...s,
        participants: s.participants.filter(p => p.id !== userId),
        participant_count: s.participant_count - 1,
        walkin_count: isWalkin ? (s.walkin_count ?? 0) - 1 : s.walkin_count,
        online_count: !isWalkin ? (s.online_count ?? s.participant_count) - 1 : s.online_count,
      }
    }))
    try {
      await socialAPI.adminRemoveMember(sessionId, userId)
    } catch (err) {
      await refreshSocialSessions()
      alert(err.response?.data?.message ?? 'Could not remove member.')
    }
  }

  const handleCreateSession = async () => {
    const { student_id, coach_id, date, selectedDays, start_time, end_time, dayTimes, notes, weeks } = sessionForm
    const days = selectedDays.length ? selectedDays : (date ? [new Date(date + 'T12:00:00').getDay()] : [])
    const hasSat = days.includes(6), hasWkd = days.some(d => d !== 6)
    const mixed = days.length > 1
    // In multi-day mode each day needs its own times; otherwise use the shared start/end
    const timesOk = mixed
      ? days.every(dow => dayTimes[dow]?.start_time && dayTimes[dow]?.end_time)
      : (start_time && end_time)
    if (!coach_id || !student_id || !date || !days.length || !timesOk) {
      alert('Please fill in all required fields.')
      return
    }
    try {
      // Create one recurring series per selected day
      for (const dow of days) {
        const startDate = nextOccurrence(date, dow)
        const times = mixed ? { start_time: dayTimes[dow].start_time, end_time: dayTimes[dow].end_time } : { start_time, end_time }
        await coachingAPI.createSession({ ...sessionForm, ...times, date: startDate })
      }
      // Auto-credit total hours: duration × weeks × number of days
      const totalHrs = days.reduce((sum, dow) => {
        const t = mixed ? dayTimes[dow] : { start_time, end_time }
        return sum + (toMins(t.end_time) - toMins(t.start_time)) / 60 * weeks
      }, 0)
      await coachingAPI.addHours(student_id, {
        delta: totalHrs,
        note: `Coaching hours — ${days.length > 1 ? `${days.length} days/week, ` : ''}${weeks} week${weeks > 1 ? 's' : ''}`,
        session_type: 'solo',
      })
      setShowSessionForm(false)
      setSessionSaved(false)
      const [{ data }, { data: allData }] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getSessions({}),
      ])
      setCoachingSessions(data.sessions)
      setAdminCheckedIn(new Set(data.sessions.filter(s => s.checked_in).map(s => s.id)))
      setAllCoachingSessions(allData.sessions)
      try {
        const { data: hd } = await coachingAPI.getHoursBalance(student_id)
        setSessionStudentBalance(hd.soloBalance)
      } catch {}
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
    setRescheduleSelected(new Set())
  }

  const refreshAfterReschedule = async () => {
    const [cur, all, grp] = await Promise.all([
      coachingAPI.getSessions({ date: coachingDate }),
      coachingAPI.getSessions({}),
      coachingAPI.getGroupSessions({ date: coachingDate }),
    ])
    setCoachingSessions(cur.data.sessions); setAdminCheckedIn(new Set(cur.data.sessions.filter(s => s.checked_in).map(s => s.id)))
    setAllCoachingSessions(all.data.sessions)
    setGroupSessions(grp.data.groups)
  }

  const refreshBookingView = async () => {
    if (!selectedDate) return
    const [{ data: bd }, { data: cd }, { data: sd }, { data: kid }] = await Promise.all([
      adminAPI.getAllBookings({ date: selectedDate }),
      coachingAPI.getSessions({ date: selectedDate }),
      socialAPI.getAdminSessions({ date: selectedDate }),
      checkinAPI.getByDate(selectedDate),
    ])
    setBookings(bd.bookings)
    setBookingViewSessions(cd.sessions)
    setBookingViewSocialSessions(sd.sessions)
    setAdminCheckIns(kid.checkIns)
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

  const handleMoveSelected = async () => {
    const sessions = rescheduleModal?.sessions ?? []
    const updates = sessions
      .filter(s => rescheduleSelected.has(s.id) && rescheduleDates[s.id])
      .map(s => {
        const u = { id: s.id, date: rescheduleDates[s.id] }
        const { start_time: newStart, end_time: newEnd } = rescheduleTime
        if (newStart && newEnd) { u.start_time = newStart; u.end_time = newEnd }
        return u
      })
    if (updates.length === 0) return alert('Pick a new date for each selected session.')
    const OPEN_DOW = new Set([1, 2, 3, 6])
    const closed = updates.filter(u => !OPEN_DOW.has(new Date(u.date + 'T12:00:00Z').getUTCDay()))
    if (closed.length > 0) {
      alert(`Cannot shift to closed day(s): ${closed.map(u => u.date).join(', ')}.\nOpen days are Mon, Tue, Wed, Sat.`)
      return
    }
    setRescheduleSaving(true)
    try {
      await coachingAPI.rescheduleBulk(updates)
      await refreshAfterReschedule()
      setRescheduleSelected(new Set())
      setRescheduleDates({})
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
    } finally { setRescheduleSaving(false) }
  }

  // Returns true if a makeup session was successfully created (so hours should NOT be deducted)
  const offerMakeupSession = async (session, allSessions) => {
    // Find the last session in this series (or just the session itself for one-offs)
    const series = session.recurrence_id
      ? allSessions.filter(s => s.recurrence_id === session.recurrence_id)
      : [session]
    const lastDate = series.map(s => s.date.slice(0, 10)).sort().at(-1)
    const firstCandidate = new Date(lastDate + 'T12:00:00Z')
    firstCandidate.setUTCDate(firstCandidate.getUTCDate() + 7)
    const firstISO = firstCandidate.toISOString().slice(0, 10)
    if (!window.confirm(`Schedule a makeup session after ${fmtDate(lastDate)} (same time)?`)) return false

    const payload = {
      coach_id:   session.coach_id,
      student_id: session.student_id,
      start_time: session.start_time.slice(0, 5),
      end_time:   session.end_time.slice(0, 5),
      notes:      session.notes ?? '',
      weeks:      1,
      ...(session.recurrence_id ? { recurrence_id: session.recurrence_id } : {}),
    }

    // Try up to 4 weeks, advancing by 1 week on each 409 conflict
    let attemptISO = firstISO
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await coachingAPI.createSession({ ...payload, date: attemptISO })
        const [{ data }, { data: allData }] = await Promise.all([
          coachingAPI.getSessions({ date: coachingDate }),
          coachingAPI.getSessions({}),
        ])
        setCoachingSessions(data.sessions); setAdminCheckedIn(new Set(data.sessions.filter(s => s.checked_in).map(s => s.id)))
        setAllCoachingSessions(allData.sessions)
        if (attemptISO !== firstISO)
          alert(`Makeup session scheduled on ${fmtDate(attemptISO)} (earlier dates were unavailable).`)
        return true
      } catch (err) {
        if (err.response?.status === 409) {
          const d = new Date(attemptISO + 'T12:00:00Z')
          d.setUTCDate(d.getUTCDate() + 7)
          attemptISO = d.toISOString().slice(0, 10)
        } else {
          alert(err.response?.data?.message ?? 'Could not schedule makeup.')
          return false
        }
      }
    }
    alert('Could not find an available slot for the makeup session within 4 weeks — please schedule it manually.')
    return false
  }

  const handleSoloBulkCancel = async (sessionIds) => {
    if (sessionIds.length === 0) return
    if (!window.confirm(`Cancel ${sessionIds.length} session${sessionIds.length > 1 ? 's' : ''}?`)) return
    try {
      for (const id of sessionIds) {
        const session = allCoachingSessions.find(s => s.id === id)
        await coachingAPI.cancelSession(id)
        if (session && !session.checked_in) {
          const hrs = (toMins(session.end_time.slice(0, 5)) - toMins(session.start_time.slice(0, 5))) / 60
          if (hrs > 0) await coachingAPI.addHours(session.student_id, { delta: -hrs, note: 'Session cancelled', session_type: 'solo' }).catch(() => {})
        }
      }
      setSoloEditSelected(new Set())
      const { data: ad } = await coachingAPI.getSessions({})
      setAllCoachingSessions(ad.sessions)
      const { data: sd } = await coachingAPI.getSessions({ date: coachingDate })
      setCoachingSessions(sd.sessions)
      // Close modal only if no sessions remain for this student+coach
      const remaining = ad.sessions.filter(s =>
        s.student_id === soloEditModal.student_id && s.coach_id === soloEditModal.coach_id && !s.group_id
      )
      if (remaining.length === 0) setSoloEditModal(null)
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel sessions.') }
  }

  const handleCalendarRescheduleSave = async () => {
    const { type, ev, newDate, newStart, newEnd } = calendarReschedule ?? {}
    if (!newDate) return
    setCalendarReschedule(prev => ({ ...prev, saving: true }))
    try {
      const timeFields = newStart && newEnd ? { start_time: newStart, end_time: newEnd } : {}
      const updates = type === 'solo'
        ? [{ id: ev.id, date: newDate, ...timeFields }]
        : ev.session_ids.map(id => ({ id, date: newDate, ...timeFields }))
      await coachingAPI.rescheduleBulk(updates)
      await refreshBookingView()
      setCalendarReschedule(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
      setCalendarReschedule(prev => ({ ...prev, saving: false }))
    }
  }

  const handleCancelSession = async (id) => {
    if (!window.confirm('Cancel this coaching session?')) return
    try {
      const session = allCoachingSessions.find(s => s.id === id) ?? coachingSessions.find(s => s.id === id)
      await coachingAPI.cancelSession(id)
      setCoachingSessions(prev => prev.filter(s => s.id !== id))
      setAllCoachingSessions(prev => prev.filter(s => s.id !== id))
      setBookingViewSessions(prev => prev.filter(s => s.id !== id))
      if (session && !session.checked_in) {
        const hasMakeup = await offerMakeupSession(session, allCoachingSessions)
        if (!hasMakeup) {
          const hrs = (toMins(session.end_time.slice(0, 5)) - toMins(session.start_time.slice(0, 5))) / 60
          await coachingAPI.addHours(session.student_id, { delta: -hrs, note: 'Session cancelled', session_type: 'solo' }).catch(() => {})
        }
      }
    } catch {
      alert('Could not cancel session.')
    }
  }

  const handleCreateGroupSession = async () => {
    const { coach_id, student_ids, date, selectedDays, start_time, end_time, dayTimes, notes, weeks } = groupForm
    const days = selectedDays.length ? selectedDays : (date ? [new Date(date + 'T12:00:00').getDay()] : [])
    const hasSat = days.includes(6), hasWkd = days.some(d => d !== 6)
    const mixed = days.length > 1
    const timesOk = mixed
      ? days.every(dow => dayTimes[dow]?.start_time && dayTimes[dow]?.end_time)
      : (start_time && end_time)
    if (!coach_id || student_ids.length < 2 || !date || !days.length || !timesOk) {
      alert('Select a coach, at least 2 students, date and times.')
      return
    }
    try {
      // Create one group series per selected day
      for (const dow of days) {
        const startDate = nextOccurrence(date, dow)
        const times = mixed ? { start_time: dayTimes[dow].start_time, end_time: dayTimes[dow].end_time } : { start_time, end_time }
        await coachingAPI.createGroupSession({ coach_id, student_ids, date: startDate, ...times, notes, weeks })
      }
      // Auto-credit hours to each student: duration × weeks × days
      const totalHrs = days.reduce((sum, dow) => {
        const t = mixed ? dayTimes[dow] : { start_time, end_time }
        return sum + (toMins(t.end_time) - toMins(t.start_time)) / 60 * weeks
      }, 0)
      await Promise.allSettled(student_ids.map(id =>
        coachingAPI.addHours(id, {
          delta: totalHrs,
          note: `Group coaching hours — ${days.length > 1 ? `${days.length} days/week, ` : ''}${weeks} week${weeks > 1 ? 's' : ''}`,
          session_type: 'group',
        })
      ))
      // Keep students/coach/weeks — clear date/days/time so admin can add another block
      setGroupForm(f => ({ ...f, date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {} }))
      setGroupStudentSearch('')
      // Refresh balances
      const updatedBalances = {}
      await Promise.allSettled(student_ids.map(async id => {
        try {
          const { data: hd } = await coachingAPI.getHoursBalance(id)
          updatedBalances[id] = hd.balance
        } catch {}
      }))
      setGroupStudentBalances(updatedBalances)
      const [{ data: sd }, { data: ad }, { data: gd }] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getSessions({}),
        coachingAPI.getGroupSessions({ date: coachingDate }),
      ])
      setCoachingSessions(sd.sessions)
      setAllCoachingSessions(ad.sessions)
      setGroupSessions(gd.groups)
      setShowGroupForm(false)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not schedule group session.')
    }
  }

  // Cancel just today's session for all students in a group, with optional move-to-end
  const handleCancelTodayGroupSession = async (ev) => {
    if (!window.confirm(`Cancel this group session for all ${ev.student_names.length} students?`)) return

    // Fetch all confirmed sessions for this group to find the last date
    let lastDate = selectedDate
    try {
      const { data } = await coachingAPI.getSessions({})
      const groupDates = [...new Set(
        data.sessions
          .filter(s => s.group_id === ev.group_id && s.date?.slice(0, 10) >= selectedDate && s.status === 'confirmed')
          .map(s => s.date?.slice(0, 10))
      )].sort()
      if (groupDates.length) lastDate = groupDates.at(-1)
    } catch {}

    const moveToDate = new Date(lastDate + 'T12:00:00Z')
    moveToDate.setUTCDate(moveToDate.getUTCDate() + 7)
    const moveToISO = moveToDate.toISOString().slice(0, 10)

    // ev.session_ids and ev.student_ids are the sessions for this group on selectedDate
    const sessions = ev.session_ids.map((id, i) => ({
      id,
      student_id: ev.student_ids[i],
      start_time: ev.start_time,
      end_time:   ev.end_time,
    }))

    if (window.confirm(`Move to end of series (${fmtDate(moveToISO)}) instead of cancelling?`)) {
      try {
        for (const s of sessions) await coachingAPI.recordLeave(s.id).catch(() => {})
        await coachingAPI.rescheduleBulk(sessions.map(s => ({ id: s.id, date: moveToISO })))
        await Promise.all([refreshAfterReschedule(), refreshBookingView()])
      } catch (err) { alert(err.response?.data?.message ?? 'Could not move sessions.') }
      return
    }

    // Full cancel + deduct hours (skip if student already checked in)
    try {
      for (const s of sessions) {
        await coachingAPI.cancelSession(s.id)
        if (s.checked_in) continue
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        if (hrs > 0) await coachingAPI.addHours(s.student_id, { delta: -hrs, note: 'Group session cancelled', session_type: 'group' }).catch(() => {})
      }
      await Promise.all([refreshAfterReschedule(), refreshBookingView()])
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel sessions.') }
  }

  const handleCancelGroupSession = async (groupId) => {
    if (!window.confirm('Cancel all sessions in this group? Hours will be deducted from each student.')) return
    try {
      // Tally remaining (today or future) hours per student before cancelling
      const today = new Date().toISOString().slice(0, 10)
      const remaining = allCoachingSessions.filter(
        s => s.group_id === groupId && s.date?.slice(0, 10) >= today
      )
      const studentHours = {}
      for (const s of remaining) {
        if (s.checked_in) continue  // hours already deducted at check-in
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        studentHours[s.student_id] = (studentHours[s.student_id] ?? 0) + hrs
      }

      await coachingAPI.cancelGroupSession(groupId)
      setGroupSessions(prev => prev.filter(g => g.group_id !== groupId))

      await Promise.allSettled(
        Object.entries(studentHours).map(([sid, hrs]) =>
          coachingAPI.addHours(Number(sid), { delta: -hrs, note: 'Group session series cancelled', session_type: 'group' })
        )
      )
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel group session.')
    }
  }

  const handleAddStudentToGroup = async (groupId, studentId) => {
    setAddStudentSaving(true)
    try {
      const { data } = await coachingAPI.addStudentToGroup(groupId, studentId)
      // Credit hours to the student: duration × sessions added
      if (data.sessions?.length) {
        const s = data.sessions[0]
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        await coachingAPI.addHours(studentId, {
          delta: hrs * data.sessions.length,
          note: `Added to group coaching (${data.sessions.length} session${data.sessions.length > 1 ? 's' : ''})`,
          session_type: 'group',
        }).catch(() => {})
      }
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      await refreshAfterReschedule()
      setAddStudentGroupId(null)
      setAddStudentSearch('')
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add student.')
    } finally { setAddStudentSaving(false) }
  }

  const handleGroupEditAddStudent = async (studentId) => {
    if (!groupEditModal) return
    setGroupEditAddSaving(true)
    try {
      const { data } = await coachingAPI.addStudentToGroup(groupEditModal.group_id, studentId)
      if (data.sessions?.length) {
        const s = data.sessions[0]
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        await coachingAPI.addHours(studentId, {
          delta: hrs * data.sessions.length,
          note: `Added to group coaching (${data.sessions.length} session${data.sessions.length > 1 ? 's' : ''})`,
          session_type: 'group',
        }).catch(() => {})
      }
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      setGroupEditAddSearch('')
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add student.')
    } finally { setGroupEditAddSaving(false) }
  }

  const handleGroupEditRemoveStudent = async (studentId, studentName) => {
    if (!groupEditModal) return
    if (!window.confirm(`Remove ${studentName} from this group?`)) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      const toDeduct = allCoachingSessions.filter(
        s => s.group_id === groupEditModal.group_id && s.student_id === studentId && s.date?.slice(0, 10) >= today && !s.checked_in
      )
      const hrs = toDeduct.reduce((sum, s) =>
        sum + (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60, 0)
      await coachingAPI.removeStudentFromGroup(groupEditModal.group_id, studentId)
      if (hrs > 0) await coachingAPI.addHours(studentId, { delta: -hrs, note: 'Removed from group coaching', session_type: 'group' }).catch(() => {})
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      else setGroupEditModal(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not remove student.')
    }
  }

  const handleGroupEditAddStudentFromDate = async (fromDate, studentId) => {
    if (!groupEditModal) return
    setDateAddSaving(true)
    try {
      const { data } = await coachingAPI.addStudentToGroup(groupEditModal.group_id, studentId, fromDate)
      if (data.sessions?.length) {
        const s = data.sessions[0]
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        await coachingAPI.addHours(studentId, {
          delta: hrs * data.sessions.length,
          note: `Added to group coaching from ${fromDate} (${data.sessions.length} session${data.sessions.length > 1 ? 's' : ''})`,
          session_type: 'group',
        }).catch(() => {})
      }
      setDateAddSearch(prev => { const n = { ...prev }; delete n[fromDate]; return n })
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not add student.')
    } finally { setDateAddSaving(false) }
  }

  const handleGroupEditRemoveStudentFromDate = async (fromDate, studentId, studentName) => {
    if (!groupEditModal) return
    if (!window.confirm(`Remove ${studentName} from all sessions from ${fmtDate(fromDate)} onwards?`)) return
    try {
      const { data } = await coachingAPI.removeStudentFromGroup(groupEditModal.group_id, studentId, fromDate)
      if (data.sessions?.length) {
        const hrs = data.sessions.filter(s => !s.checked_in).reduce((sum, s) =>
          sum + (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60, 0)
        if (hrs > 0) await coachingAPI.addHours(studentId, { delta: -hrs, note: `Removed from group coaching from ${fromDate}`, session_type: 'group' }).catch(() => {})
      }
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      else setGroupEditModal(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not remove student.')
    }
  }

  const handleMoveGroupSelected = async () => {
    if (!groupEditModal) return
    const today = new Date().toISOString().slice(0, 10)
    // Build date → [session ids] map for this group
    const dateGroups = {}
    for (const s of allCoachingSessions) {
      if (s.group_id !== groupEditModal.group_id) continue
      const d = s.date?.slice(0, 10)
      if (!d || d < today) continue
      if (!dateGroups[d]) dateGroups[d] = []
      dateGroups[d].push(s.id)
    }
    const updates = []
    const { start_time: newStart, end_time: newEnd } = rescheduleTime
    for (const [date, ids] of Object.entries(dateGroups)) {
      const newDate = rescheduleDates[date]
      if (!rescheduleSelected.has(date) || !newDate) continue
      for (const id of ids) {
        const u = { id, date: newDate }
        if (newStart && newEnd) { u.start_time = newStart; u.end_time = newEnd }
        updates.push(u)
      }
    }
    if (updates.length === 0) return alert('Pick a new date for each selected session.')
    const OPEN_DOW = new Set([1, 2, 3, 6])
    const closed = [...new Set(updates.map(u => u.date))].filter(d => !OPEN_DOW.has(new Date(d + 'T12:00:00Z').getUTCDay()))
    if (closed.length > 0) {
      alert(`Cannot shift to closed day(s): ${closed.join(', ')}.\nOpen days are Mon, Tue, Wed, Sat.`)
      return
    }
    setRescheduleSaving(true)
    try {
      await coachingAPI.rescheduleBulk(updates)
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      setRescheduleSelected(new Set())
      setRescheduleDates({})
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
    } finally { setRescheduleSaving(false) }
  }

  const buildGroupDateMap = () => {
    if (!groupEditModal) return {}
    const today = new Date().toISOString().slice(0, 10)
    const map = {}
    for (const s of allCoachingSessions) {
      if (s.group_id !== groupEditModal.group_id) continue
      const d = s.date?.slice(0, 10)
      if (!d || d < today) continue
      if (!map[d]) map[d] = []
      map[d].push(s)
    }
    return map
  }

  const handleCancelEntireSessionDate = async (date, sessionsOnDate) => {
    if (!window.confirm(`Cancel the entire group session on ${fmtDate(date)} for all ${sessionsOnDate.length} students?`)) return

    const map = buildGroupDateMap()
    const allDates = Object.keys(map).sort()
    const lastDate = allDates.filter(d => map[d].some(s => !s.is_makeup)).at(-1) ?? allDates.at(-1)
    const moveToDate = new Date((lastDate ?? date) + 'T12:00:00Z')
    moveToDate.setUTCDate(moveToDate.getUTCDate() + 7)
    const moveToISO = moveToDate.toISOString().slice(0, 10)

    const refreshGroup = async () => {
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      else setGroupEditModal(null)
    }

    if (window.confirm(`Move to end of series (${fmtDate(moveToISO)}) instead of cancelling?`)) {
      try {
        await coachingAPI.rescheduleBulk(sessionsOnDate.map(s => ({ id: s.id, date: moveToISO })))
        await refreshGroup()
      } catch (err) { alert(err.response?.data?.message ?? 'Could not move sessions.') }
      return
    }

    // Full cancel — deduct hours for each student (skip if already checked in)
    try {
      for (const s of sessionsOnDate) {
        await coachingAPI.cancelSession(s.id)
        if (s.checked_in) continue
        const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
        if (hrs > 0) await coachingAPI.addHours(s.student_id, { delta: -hrs, note: `Group session cancelled on ${date}`, session_type: 'group' }).catch(() => {})
      }
      await refreshGroup()
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel session.') }
  }

  const handleBulkCancelSelectedDates = async (dateMap) => {
    const dates = [...groupEditSelected].sort()
    if (dates.length === 0) return
    const totalSessions = dates.reduce((sum, d) => sum + (dateMap[d]?.length ?? 0), 0)
    if (!window.confirm(`Cancel ${dates.length} session${dates.length > 1 ? 's' : ''} (${totalSessions} student session${totalSessions > 1 ? 's' : ''} total)?`)) return
    try {
      for (const date of dates) {
        const sessionsOnDate = dateMap[date] ?? []
        for (const s of sessionsOnDate) {
          await coachingAPI.cancelSession(s.id)
          if (s.checked_in) continue
          const hrs = (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
          if (hrs > 0) await coachingAPI.addHours(s.student_id, { delta: -hrs, note: `Group session cancelled on ${date}`, session_type: 'group' }).catch(() => {})
        }
      }
      setGroupEditSelected(new Set())
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      else setGroupEditModal(null)
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel sessions.') }
  }

  const handleGroupDateSaveOne = async (fromDate) => {
    const { date: newDate, start_time, end_time } = groupEditForm
    if (!newDate) return
    const OPEN_DOW = new Set([1, 2, 3, 6])
    if (!OPEN_DOW.has(new Date(newDate + 'T12:00:00Z').getUTCDay())) {
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      alert(`${newDate} is a ${dayNames[new Date(newDate+'T12:00:00Z').getUTCDay()]} — club is closed. Open days are Mon, Tue, Wed, Sat.`)
      return
    }
    const map = buildGroupDateMap()
    const ids = (map[fromDate] ?? []).map(s => s.id)
    const updates = ids.map(id => {
      const u = { id, date: newDate }
      if (start_time && end_time) { u.start_time = start_time; u.end_time = end_time }
      return u
    })
    setGroupEditSaving(true)
    try {
      await coachingAPI.rescheduleBulk(updates)
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      setGroupEditModal(prev => gd.groups.find(g => g.group_id === prev?.group_id) ?? null)
      setGroupEditSessionDate(null)
    } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
    finally { setGroupEditSaving(false) }
  }

  const handleGroupDateSaveFromHere = async (fromDate) => {
    const { date: newFirstDate, start_time, end_time } = groupEditForm
    if (!newFirstDate) return alert('Pick a new date.')
    const map = buildGroupDateMap()
    const futureDates = Object.keys(map).filter(d => d >= fromDate).sort()
    const deltaDays = Math.round((new Date(newFirstDate + 'T12:00:00Z') - new Date(fromDate + 'T12:00:00Z')) / 86400000)
    const OPEN_DOW = new Set([1, 2, 3, 6])
    const updates = []
    for (const d of futureDates) {
      const shifted = new Date(d + 'T12:00:00Z')
      shifted.setUTCDate(shifted.getUTCDate() + deltaDays)
      const shiftedISO = shifted.toISOString().slice(0, 10)
      if (!OPEN_DOW.has(shifted.getUTCDay())) {
        alert(`Cannot shift to closed day: ${shiftedISO}. Open days are Mon, Tue, Wed, Sat.`)
        return
      }
      for (const s of map[d]) {
        const u = { id: s.id, date: shiftedISO }
        if (start_time && end_time) { u.start_time = start_time; u.end_time = end_time }
        updates.push(u)
      }
    }
    setGroupEditSaving(true)
    try {
      await coachingAPI.rescheduleBulk(updates)
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      setGroupEditModal(prev => gd.groups.find(g => g.group_id === prev?.group_id) ?? null)
      setGroupEditSessionDate(null)
    } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
    finally { setGroupEditSaving(false) }
  }

  const handleCancelStudentOnDate = async (session) => {
    if (!groupEditModal) return
    if (!window.confirm(`Cancel ${session.student_name}'s session on ${fmtDate(session.date?.slice(0, 10))}?`)) return

    const refreshGroup = async () => {
      await refreshAfterReschedule()
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      const updated = gd.groups.find(g => g.group_id === groupEditModal.group_id)
      if (updated) setGroupEditModal(updated)
      else setGroupEditModal(null)
    }

    const map = buildGroupDateMap()
    const allDates = Object.keys(map).sort()
    // Use last date that has original (non-makeup) sessions so all makeups land on the same week
    const lastDate = allDates.filter(d => map[d].some(s => !s.is_makeup)).at(-1) ?? allDates.at(-1)
    const moveToDate = new Date((lastDate ?? session.date?.slice(0, 10)) + 'T12:00:00Z')
    moveToDate.setUTCDate(moveToDate.getUTCDate() + 7)
    // Ensure the makeup lands strictly after the session being rescheduled
    const sessionDate = new Date(session.date.slice(0, 10) + 'T12:00:00Z')
    while (moveToDate <= sessionDate) moveToDate.setUTCDate(moveToDate.getUTCDate() + 7)
    const moveToISO = moveToDate.toISOString().slice(0, 10)

    if (window.confirm(`Move this session to the end of the series (${fmtDate(moveToISO)}) instead of cancelling?`)) {
      // Makeup: record leave, reschedule — no hour deduction
      try {
        await coachingAPI.recordLeave(session.id)
        await coachingAPI.rescheduleBulk([{ id: session.id, date: moveToISO }])
        await refreshGroup()
      } catch (err) { alert(err.response?.data?.message ?? 'Could not move session.') }
      return
    }

    // Full cancel: record leave, then cancel
    try {
      await coachingAPI.recordLeave(session.id)
      await coachingAPI.cancelSession(session.id)
      if (!session.checked_in) {
        const hrs = (toMins(session.end_time.slice(0, 5)) - toMins(session.start_time.slice(0, 5))) / 60
        if (hrs > 0) await coachingAPI.addHours(session.student_id, { delta: -hrs, note: 'Group session cancelled', session_type: 'group' }).catch(() => {})
      }
      await refreshGroup()
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel session.') }
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

  const refreshCoachingSessions = async () => {
    try {
      const [{ data: sd }, { data: ad }, { data: gd }] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getSessions({}),
        coachingAPI.getGroupSessions({ date: coachingDate }),
      ])
      setCoachingSessions(sd.sessions)
      setAdminCheckedIn(new Set(sd.sessions.filter(s => s.checked_in).map(s => s.id)))
      setAllCoachingSessions(ad.sessions)
      setGroupSessions(gd.groups)
    } catch {}
  }

  const handleAdminCheckInCoaching = async (sessionId, studentId) => {
    try {
      await checkinAPI.adminCheckInCoaching(sessionId, studentId)
      await refreshCoachingSessions()
      setAdminCheckIns(prev => {
        if (prev.some(ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === studentId)) return prev
        return [...prev, { type: 'coaching', reference_id: String(sessionId), user_id: studentId }]
      })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not check in.')
    }
  }

  const handleAdminUndoCheckInCoaching = async (sessionId, studentId) => {
    try {
      await checkinAPI.cancelCheckIn('coaching', String(sessionId), studentId)
      await refreshCoachingSessions()
      setAdminCheckIns(prev => prev.filter(ci => !(ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === studentId)))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not undo check-in.')
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

            const todayStr = new Date().toISOString().slice(0, 10)
            const isFuture = todayDate > todayStr

            const handleCheckIn = async (type, refId, userId) => {
              try {
                if (type === 'booking')  await checkinAPI.adminCheckInBooking(refId, userId)
                if (type === 'coaching') await checkinAPI.adminCheckInCoaching(refId, userId)
                if (type === 'social')   await checkinAPI.adminCheckInSocial(refId, userId)
                if (type === 'coaching') {
                  setAdminCheckedIn(prev => new Set([...prev, refId]))
                  setAdminCheckIns(prev => {
                    if (prev.some(ci => ci.type === 'coaching' && ci.reference_id === String(refId) && ci.user_id === userId)) return prev
                    return [...prev, { type: 'coaching', reference_id: String(refId), user_id: userId }]
                  })
                }
                loadTodaySummary(todayDate)
              } catch (err) {
                alert(err.response?.data?.message ?? 'Check-in failed.')
              }
            }

            const handleUndoCheckIn = async (type, refId, userId) => {
              try {
                await checkinAPI.cancelCheckIn(type, String(refId), userId)
                if (type === 'coaching') {
                  setAdminCheckedIn(prev => { const n = new Set(prev); n.delete(refId); return n })
                  setAdminCheckIns(prev => prev.filter(ci => !(ci.type === 'coaching' && ci.reference_id === String(refId) && ci.user_id === userId)))
                }
                loadTodaySummary(todayDate)
              } catch (err) {
                alert(err.response?.data?.message ?? 'Could not undo check-in.')
              }
            }

            const Badge = ({ in: checkedIn, type, refId, userId }) => checkedIn
              ? (
                <span className="flex items-center gap-1">
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Checked in</span>
                  <button
                    onClick={() => handleUndoCheckIn(type, refId, userId)}
                    className="text-[10px] text-slate-500 hover:text-red-400 font-medium transition-colors"
                    title="Undo check-in"
                  >✕</button>
                </span>
              )
              : <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">Not in</span>

            return (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <p className="text-slate-400 text-sm">{todayLabel}</p>
                    <input
                      type="date"
                      max={todayStr}
                      value={todayDate}
                      onChange={e => { setTodayDate(e.target.value); setTodaySummary(null) }}
                      className="input text-xs py-1 px-2"
                    />
                  </div>
                  <button onClick={() => loadTodaySummary(todayDate)} className="text-xs text-slate-400 hover:text-white transition-colors">↺ Refresh</button>
                </div>
                {isFuture && (
                  <p className="text-amber-400 text-xs">Future date selected — check-in is not available.</p>
                )}

                {noActivity && (
                  <p className="text-slate-400 text-sm">No activities scheduled for this date.</p>
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
                                <Badge in={m.checked_in} type="booking" refId={g.group_id} userId={m.user_id} />
                                {!m.checked_in && !isFuture && (
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
                {coaching.length > 0 && (() => {
                  // Group all sessions by coach
                  const byCoach = {}
                  for (const c of individualCoaching) {
                    if (!byCoach[c.coach_name]) byCoach[c.coach_name] = { coach_name: c.coach_name, coach_user_id: c.coach_user_id, sessions: [] }
                    byCoach[c.coach_name].sessions.push({ type: 'solo', data: c })
                  }
                  for (const g of groupCoachingSessions) {
                    if (!byCoach[g.coach_name]) byCoach[g.coach_name] = { coach_name: g.coach_name, coach_user_id: g.coach_user_id, sessions: [] }
                    byCoach[g.coach_name].sessions.push({ type: 'group', data: g })
                  }
                  const coachEntries = Object.values(byCoach).sort((a, b) => a.coach_name.localeCompare(b.coach_name))
                  return (
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Coaching Sessions</p>
                      <div className="space-y-5">
                        {coachEntries.map(coach => (
                          <div key={coach.coach_name}>
                            <p className="text-sm text-white mb-2 px-1">{coach.coach_name}</p>
                            <div className="space-y-2">
                              {coach.sessions.sort((a, b) => a.data.start_time < b.data.start_time ? -1 : 1).map(({ type, data: c }) => (
                                <div key={type === 'solo' ? c.id : c.group_id} className="card py-3 px-4">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-xs font-mono text-slate-300">{fmtTime(c.start_time)} – {fmtTime(c.end_time)}</span>
                                    <span className="text-xs text-slate-500">{c.court_name}</span>
                                    {type === 'group' && <span className="text-[10px] bg-teal-500/15 text-teal-400 px-2 py-0.5 rounded-full">Group</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {type === 'solo' ? (
                                      <div className="flex items-center gap-1.5 bg-court-dark rounded-lg px-3 py-1.5">
                                        {c.admin_checked_in ? (
                                          <>
                                            <button onClick={() => handleUndoCheckIn('coaching', c.id, c.student_id)} className="text-xs text-sky-400 hover:text-red-400 transition-colors" title="Undo check-in">✓ {c.student_name}</button>
                                          </>
                                        ) : !isFuture ? (
                                          <button onClick={() => handleCheckIn('coaching', c.id, c.student_id)} className="text-xs text-white hover:text-emerald-300 transition-colors" title="Check in">{c.student_name}</button>
                                        ) : (
                                          <span className="text-xs text-white">{c.student_name}</span>
                                        )}
                                        <span className="text-[10px] text-slate-500">student</span>
                                      </div>
                                    ) : (
                                      c.students.map(s => (
                                        <div key={s.student_id} className="flex items-center gap-1.5 bg-court-dark rounded-lg px-3 py-1.5">
                                          {s.admin_checked_in ? (
                                            <button onClick={() => handleUndoCheckIn('coaching', s.id, s.student_id)} className="text-xs text-sky-400 hover:text-red-400 transition-colors" title="Undo check-in">✓ {s.student_name}</button>
                                          ) : !isFuture ? (
                                            <button onClick={() => handleCheckIn('coaching', s.id, s.student_id)} className="text-xs text-white hover:text-emerald-300 transition-colors" title="Check in">{s.student_name}</button>
                                          ) : (
                                            <span className="text-xs text-white">{s.student_name}</span>
                                          )}
                                          <span className="text-[10px] text-slate-500">student</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

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
                                <Badge in={m.checked_in} type="social" refId={g.id} userId={m.user_id} />
                                {!m.checked_in && !isFuture && (
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
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="sticky top-0 bg-court-mid text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider border-b border-court-light z-10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(m => {
                      const coachRec = m.role === 'coach' ? coaches.find(c => c.user_id === m.id) : null
                      const isCoachExpanded = expandedCoachMemberId === m.id
                      const todayISO = new Date().toISOString().slice(0, 10)

                      // Build student list for this coach (from allCoachingSessions)
                      const coachStudents = (() => {
                        if (!coachRec) return []
                        const byStudent = {}
                        for (const s of allCoachingSessions) {
                          if (s.coach_id !== coachRec.id) continue
                          if (!byStudent[s.student_id]) byStudent[s.student_id] = { student_id: s.student_id, student_name: s.student_name, sessions: [] }
                          byStudent[s.student_id].sessions.push(s)
                        }
                        return Object.values(byStudent).sort((a, b) => a.student_name.localeCompare(b.student_name))
                      })()

                      return (
                        <React.Fragment key={m.id}>
                          <tr className={`border-b border-court-light/50 ${isCoachExpanded ? '' : 'last:border-0'} hover:bg-court-light/30 transition-colors`}>
                            <td className="px-5 py-3 font-medium w-[20%]">
                              {coachRec ? (
                                <button
                                  onClick={() => { setCoachViewModal({ coach_id: coachRec.id, coach_name: m.name, email: coachRec.email, phone: coachRec.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                  className="text-left text-white hover:text-sky-400 transition-colors">
                                  {m.name}
                                </button>
                              ) : (
                                <button onClick={() => handleOpenMemberModal(m.id)} className="text-white hover:text-brand-400 transition-colors text-left">{m.name}</button>
                              )}
                            </td>
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

                          {/* Inline coach expansion — student list */}
                          {isCoachExpanded && (
                            <tr className="border-b border-court-light/50 bg-court-light/10">
                              <td colSpan={5} className="px-6 py-3">
                                {coachStudents.length === 0 ? (
                                  <p className="text-slate-500 text-xs py-1">No sessions found for this coach.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {coachStudents.map(({ student_id, student_name, sessions }) => {
                                      const isStudentExpanded = coachRowExpanded.has(student_id)
                                      const sorted = [...sessions].sort((a, b) => a.date < b.date ? -1 : 1)
                                      const upcoming = sorted.filter(s => s.date?.slice(0, 10) >= todayISO)
                                      const past = sorted.filter(s => s.date?.slice(0, 10) < todayISO)
                                      return (
                                        <div key={student_id} className={`rounded-lg border ${isStudentExpanded ? 'border-court-light bg-court' : 'border-transparent'}`}>
                                          <button
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                                            onClick={() => setCoachRowExpanded(prev => {
                                              const n = new Set(prev)
                                              isStudentExpanded ? n.delete(student_id) : n.add(student_id)
                                              return n
                                            })}>
                                            <span className="font-medium text-white text-sm">{student_name}</span>
                                            <div className="flex items-center gap-3">
                                              <span className="text-xs text-slate-400">{upcoming.length} upcoming · {past.length} past</span>
                                              <span className="text-slate-500 text-xs">{isStudentExpanded ? '▲' : '▼'}</span>
                                            </div>
                                          </button>
                                          {isStudentExpanded && (
                                            <div className="border-t border-court-light/40 px-4 pb-3 pt-2 space-y-1">
                                              {sorted.map(s => {
                                                const isPast = s.date?.slice(0, 10) < todayISO
                                                const checkedIn = s.checked_in || adminCheckedIn.has(s.id)
                                                return (
                                                  <div key={s.id} className="flex items-center gap-2 py-1">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${s.group_id ? 'bg-teal-500/15 text-teal-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                                      {s.group_id ? 'Group' : '1-on-1'}
                                                    </span>
                                                    <span className={`text-sm flex-1 ${isPast ? 'text-slate-500' : 'text-white'}`}>{fmtDate(s.date)}</span>
                                                    <span className="text-xs text-slate-500 font-mono">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                                                    {isPast
                                                      ? checkedIn
                                                        ? <span className="text-emerald-400 text-xs font-medium shrink-0">✓ In</span>
                                                        : <span className="text-slate-600 text-xs shrink-0">— No show</span>
                                                      : checkedIn
                                                        ? <span className="text-emerald-400 text-xs font-medium shrink-0">✓ In</span>
                                                        : <span className="text-slate-500 text-xs shrink-0">Upcoming</span>
                                                    }
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
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
              const lastSlotMins   = slotsForDay.length ? toMins(slotsForDay[slotsForDay.length - 1]) + 30 : 1230
              const closingSlot    = `${String(Math.floor(lastSlotMins / 60)).padStart(2, '0')}:${String(lastSlotMins % 60).padStart(2, '0')}`
              const openTimeSlots  = [...slotsForDay, closingSlot]

              // Returns end-time options after a given start, and auto-selects +1hr
              const endSlotsAfter  = (start) => openTimeSlots.filter(t => toMins(t) > toMins(start))
              const autoEndTime    = (start) => {
                const preferred = toMins(start) + 60
                const hh = String(Math.floor(preferred / 60)).padStart(2, '0')
                const mm = String(preferred % 60).padStart(2, '0')
                const key = `${hh}:${mm}`
                const ends = endSlotsAfter(start)
                return ends.includes(key) ? key : (ends[0] ?? start)
              }

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
                                <button
                                  onClick={() => handleAdminUndoCheckIn('booking', ev.booking_group_id, ev.user_id)}
                                  className="text-xs text-emerald-400 hover:text-red-400 leading-none transition-colors"
                                  title="Undo check-in"
                                >✓ In</button>
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
                        const soloEditing = calendarReschedule?.type === 'solo' && calendarReschedule.ev.id === ev.id
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height: soloEditing ? 'auto' : height, left, width, zIndex: soloEditing ? 20 : undefined }}
                            className={`bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 flex flex-col ${soloEditing ? 'overflow-visible' : 'overflow-hidden'}`}
                          >
                            <button
                              onClick={() => checkedIn
                                ? handleAdminUndoCheckIn('coaching', ev.id, ev.student_id)
                                : handleAdminCheckIn('coaching', ev.id, ev.student_id)
                              }
                              className={`text-xs truncate leading-none text-left transition-colors ${checkedIn ? 'text-sky-400 hover:text-red-400' : 'text-emerald-300 hover:text-emerald-200'}`}
                              title={checkedIn ? 'Undo check-in' : 'Check in'}
                            >{checkedIn ? '✓ ' : ''}{ev.student_name}</button>
                            <p className="text-slate-300 text-xs mt-1 leading-none">Coach: {ev.coach_name}</p>
                            <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-end gap-1 flex-wrap">
                              {soloEditing ? (
                                <>
                                  <input type="date" className="input py-0.5 px-1 text-xs" style={{width:'7.5rem'}}
                                    value={calendarReschedule.newDate}
                                    onChange={e => setCalendarReschedule(prev => ({ ...prev, newDate: e.target.value }))} />
                                  <select className="input py-0.5 px-1 text-xs" style={{width:'6rem'}}
                                    value={calendarReschedule.newStart}
                                    onChange={e => { const ns = e.target.value; setCalendarReschedule(prev => ({ ...prev, newStart: ns, newEnd: autoEndTime(ns) })) }}>
                                    {openTimeSlots.slice(0, -1).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                                  </select>
                                  <span className="text-slate-400 text-xs">–</span>
                                  <select className="input py-0.5 px-1 text-xs" style={{width:'6rem'}}
                                    value={calendarReschedule.newEnd}
                                    onChange={e => setCalendarReschedule(prev => ({ ...prev, newEnd: e.target.value }))}>
                                    {endSlotsAfter(calendarReschedule.newStart).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                                  </select>
                                  <button onClick={handleCalendarRescheduleSave} disabled={calendarReschedule.saving} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">Save</button>
                                  <button onClick={() => setCalendarReschedule(null)} className="text-xs text-slate-400 hover:text-slate-200">✕</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => setCalendarReschedule({ type: 'solo', ev, newDate: selectedDate, newStart: ev.start_time.slice(0,5), newEnd: ev.end_time.slice(0,5), saving: false })} className="text-xs text-sky-400 hover:text-sky-300 leading-none">Edit</button>
                                  <button onClick={() => handleCancelSession(ev.id)} className="text-xs text-red-400 hover:text-red-300 leading-none">Cancel</button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      }

                      if (ev.type === 'coaching_group') {
                        const groupEditing = calendarReschedule?.type === 'group' && calendarReschedule.ev.group_id === ev.group_id
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height: groupEditing ? 'auto' : height, left, width, zIndex: groupEditing ? 20 : undefined }}
                            className={`bg-teal-500/15 border border-teal-500/40 rounded-lg px-2.5 py-1.5 flex flex-col ${groupEditing ? 'overflow-visible' : 'overflow-hidden'}`}
                          >
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {ev.student_names.map((name, i) => {
                                const sid       = ev.student_ids[i]
                                const sessionId = ev.session_ids[i]
                                const ciIn = adminCheckIns.some(
                                  ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === sid
                                )
                                return (
                                  <button
                                    key={i}
                                    onClick={() => ciIn
                                      ? handleAdminUndoCheckIn('coaching', sessionId, sid)
                                      : handleAdminCheckIn('coaching', sessionId, sid)
                                    }
                                    className={`text-xs leading-none text-left transition-colors ${ciIn ? 'text-sky-400 hover:text-red-400' : 'text-teal-300 hover:text-teal-200'}`}
                                    title={ciIn ? 'Undo check-in' : 'Check in'}
                                  >{ciIn ? '✓ ' : ''}{name}</button>
                                )
                              })}
                            </div>
                            <p className="text-slate-400 text-xs mt-0.5 leading-none">Coach: {ev.coach_name}</p>
                            <p className="text-slate-300 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-end gap-1 flex-wrap">
                              {groupEditing ? (
                                <>
                                  <input type="date" className="input py-0.5 px-1 text-xs" style={{width:'7.5rem'}}
                                    value={calendarReschedule.newDate}
                                    onChange={e => setCalendarReschedule(prev => ({ ...prev, newDate: e.target.value }))} />
                                  <select className="input py-0.5 px-1 text-xs" style={{width:'6rem'}}
                                    value={calendarReschedule.newStart}
                                    onChange={e => { const ns = e.target.value; setCalendarReschedule(prev => ({ ...prev, newStart: ns, newEnd: autoEndTime(ns) })) }}>
                                    {openTimeSlots.slice(0, -1).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                                  </select>
                                  <span className="text-slate-400 text-xs">–</span>
                                  <select className="input py-0.5 px-1 text-xs" style={{width:'6rem'}}
                                    value={calendarReschedule.newEnd}
                                    onChange={e => setCalendarReschedule(prev => ({ ...prev, newEnd: e.target.value }))}>
                                    {endSlotsAfter(calendarReschedule.newStart).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                                  </select>
                                  <button onClick={handleCalendarRescheduleSave} disabled={calendarReschedule.saving} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">Save</button>
                                  <button onClick={() => setCalendarReschedule(null)} className="text-xs text-slate-400 hover:text-slate-200">✕</button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setCalendarReschedule({ type: 'group', ev, newDate: selectedDate, newStart: ev.start_time.slice(0,5), newEnd: ev.end_time.slice(0,5), saving: false })}
                                    className="text-xs text-sky-400 hover:text-sky-300 leading-none"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleCancelTodayGroupSession(ev)}
                                    className="text-xs text-red-400 hover:text-red-300 leading-none"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
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
                          <div className="mt-auto flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSocialCalendarEdit({ id: ev.id, title: ev.title, num_courts: ev.num_courts, max_players: ev.max_players, date: ev.date, start_time: ev.start_time.slice(0,5), end_time: ev.end_time.slice(0,5), saving: false })}
                              className="text-xs text-sky-400 hover:text-sky-300 leading-none"
                            >Edit</button>
                            <button
                              onClick={() => handleCancelSocialSession(ev.id)}
                              className="text-xs text-red-400 hover:text-red-300 leading-none"
                            >Cancel</button>
                          </div>
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
                onClick={() => { setShowSessionForm(v => !v); setShowGroupForm(false); setSessionSaved(false) }}
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
                const formDow      = sessionForm.date ? new Date(sessionForm.date + 'T12:00:00').getDay() : null
                const effectiveDows = sessionForm.selectedDays.length ? sessionForm.selectedDays : (formDow != null ? [formDow] : [])
                const hasSat  = effectiveDows.includes(6)
                const hasWkd  = effectiveDows.some(d => d !== 6)
                const formSlots = hasSat && hasWkd ? ALL_SLOTS : hasSat ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                const endSlots  = formSlots.filter(s => !sessionForm.start_time || toMins(s) > toMins(sessionForm.start_time))
                return (
                  <div className="card mb-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-300 uppercase tracking-widest">New One-on-One Session</p>
                      <button onClick={() => { setShowSessionForm(false); setSessionSaved(false) }}
                        className="text-xs text-slate-400 hover:text-white">✕ Close</button>
                    </div>
                    {sessionSaved && (
                      <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
                        Session scheduled! Student/coach kept — pick another day to add a second session this week.
                      </div>
                    )}
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
                        onChange={e => {
                          setStudentSearch(e.target.value)
                          setSessionForm(f => ({ ...f, student_id: '' }))
                          setSessionStudentBalance(null)
                        }}
                      />
                      {studentSearch && (
                        <div className="mt-1 border border-court-light rounded-lg overflow-y-auto max-h-[160px] bg-court">
                          {members
                            .filter(m => m.name.toLowerCase().includes(studentSearch.toLowerCase()) || m.email.toLowerCase().includes(studentSearch.toLowerCase()))
                            .map(m => (
                              <button key={m.id} type="button"
                                onClick={async () => {
                                  setSessionForm(f => ({ ...f, student_id: String(m.id) }))
                                  setStudentSearch(m.name)
                                  try {
                                    const { data } = await coachingAPI.getHoursBalance(m.id)
                                    setSessionStudentBalance(data.soloBalance)
                                  } catch { setSessionStudentBalance(null) }
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-court-light/40 transition-colors ${String(sessionForm.student_id) === String(m.id) ? 'text-brand-300 bg-court-light/20' : 'text-slate-300'}`}
                              >
                                {m.name}<span className="text-slate-400 text-xs ml-2">{m.email}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Starting week</label>
                      <input type="date" className="input w-full" value={sessionForm.date}
                        onChange={e => setSessionForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Days of week</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{dow:1,label:'Mon'},{dow:2,label:'Tue'},{dow:3,label:'Wed'},{dow:6,label:'Sat'}].map(({dow,label}) => {
                          const active = sessionForm.selectedDays.includes(dow)
                          return (
                            <button key={dow} type="button"
                              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                              onClick={() => setSessionForm(f => ({
                                ...f,
                                selectedDays: active
                                  ? f.selectedDays.filter(d => d !== dow)
                                  : [...f.selectedDays, dow]
                              }))}>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Leave all unselected to use the starting-week date as-is.</p>
                    </div>
                    {effectiveDows.length > 1 ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-200">Times per day</label>
                        {effectiveDows.map(dow => {
                          const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]
                          const slots = dow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                          const dt = sessionForm.dayTimes[dow] || { start_time: '', end_time: '' }
                          const eSlots = slots.filter(s => !dt.start_time || toMins(s) > toMins(dt.start_time))
                          return (
                            <div key={dow} className="flex gap-2 items-center">
                              <span className="text-xs text-slate-400 w-8">{dayLabel}</span>
                              <select className="input text-xs py-1 flex-1" value={dt.start_time}
                                onChange={e => {
                                  const s = e.target.value
                                  const autoEnd = slots.find(t => toMins(t) === toMins(s) + 60) ?? ''
                                  setSessionForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { start_time: s, end_time: autoEnd } } }))
                                }}>
                                <option value="">Start…</option>
                                {slots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                              </select>
                              <select className="input text-xs py-1 flex-1" value={dt.end_time}
                                onChange={e => setSessionForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { ...dt, end_time: e.target.value } } }))}
                                disabled={!dt.start_time}>
                                <option value="">End…</option>
                                {eSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">Start Time</label>
                        <select className="input w-full" value={sessionForm.start_time}
                          onChange={e => {
                            const s = e.target.value
                            const autoEnd = formSlots.find(t => toMins(t) === toMins(s) + 60) ?? ''
                            setSessionForm(f => ({ ...f, start_time: s, end_time: autoEnd }))
                          }}>
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
                    )}
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
                    {sessionForm.start_time && sessionForm.end_time && (() => {
                      const hrsPerSession = (toMins(sessionForm.end_time) - toMins(sessionForm.start_time)) / 60
                      const numDays = sessionForm.selectedDays.length || 1
                      const total = hrsPerSession * sessionForm.weeks * numDays
                      return (
                        <p className="text-xs text-slate-400">
                          Will credit <span className="font-medium text-white">{total.toFixed(1)} hrs</span> to student
                          {' '}({hrsPerSession.toFixed(1)} hr × {sessionForm.weeks} week{sessionForm.weeks > 1 ? 's' : ''}{numDays > 1 ? ` × ${numDays} days` : ''}).
                          Deducted each time they attend.
                        </p>
                      )
                    })()}
                    <button onClick={handleCreateSession} className="btn-primary text-sm">
                      {(() => {
                        const numDays = sessionForm.selectedDays.length || 1
                        const total = sessionForm.weeks * numDays
                        return `Create Session${total > 1 ? ` (${total} session${total > 1 ? 's' : ''})` : ''}`
                      })()}
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
                        {['Student', 'Coach', 'Time', 'Hours', 'Notes', 'Actions'].map(h => (
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
                        const adminCI = s.admin_checked_in || adminCheckedIn.has(s.id)
                        return (
                          <tr key={s.id} className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => adminCI
                                    ? handleAdminUndoCheckInCoaching(s.id, s.student_id)
                                    : handleAdminCheckInCoaching(s.id, s.student_id)
                                  }
                                  className={`font-medium transition-colors text-left ${adminCI ? 'text-sky-400 hover:text-red-400' : 'text-white hover:text-emerald-300'}`}
                                  title={adminCI ? 'Undo check-in' : 'Check in'}
                                >{adminCI ? '✓ ' : ''}{s.student_name}</button>
                                <button onClick={() => handleOpenMemberModal(s.student_id)}
                                  className="text-slate-600 hover:text-brand-400 transition-colors flex-shrink-0" title="View member">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </button>
                              </div>
                              <p className="text-slate-400 text-xs">{s.student_email}</p>
                            </td>
                            <td className="px-5 py-3">
                              <button onClick={() => { const ci = coaches.find(c => c.id === s.coach_id); setCoachViewModal({ coach_id: s.coach_id, coach_name: s.coach_name, email: ci?.email, phone: ci?.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                className="text-slate-300 hover:text-sky-400 transition-colors text-left">
                                {s.coach_name}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-slate-300 text-xs font-mono whitespace-nowrap">
                              {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                            </td>
                            <td className="px-5 py-3 text-xs font-mono">
                              {sessionBalances[s.student_id] !== undefined ? (
                                <span className={sessionBalances[s.student_id].solo < 0 ? 'text-red-400' : sessionBalances[s.student_id].solo < 1 ? 'text-amber-400' : 'text-emerald-400'}>
                                  {sessionBalances[s.student_id].solo.toFixed(1)}h
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-5 py-3 text-slate-400 text-xs max-w-[160px] truncate">{s.notes ?? '—'}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => handleCancelSession(s.id)}
                                  className="text-xs text-red-400 hover:text-red-300 font-medium">
                                  Cancel
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
                const formDow      = groupForm.date ? new Date(groupForm.date + 'T12:00:00').getDay() : null
                const effectiveDows = groupForm.selectedDays.length ? groupForm.selectedDays : (formDow != null ? [formDow] : [])
                const hasSat  = effectiveDows.includes(6)
                const hasWkd  = effectiveDows.some(d => d !== 6)
                const formSlots = hasSat && hasWkd ? ALL_SLOTS : hasSat ? SATURDAY_SLOTS : WEEKDAY_SLOTS
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
                          {selectedStudents.map(m => {
                            const bal = groupStudentBalances[m.id]
                            return (
                              <span key={m.id} className="flex items-center gap-1 bg-brand-500/20 border border-brand-500/40 text-brand-300 text-xs px-2.5 py-1 rounded-full">
                                {m.name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGroupForm(f => ({ ...f, student_ids: f.student_ids.filter(id => id !== m.id) }))
                                    setGroupStudentBalances(b => { const n = { ...b }; delete n[m.id]; return n })
                                  }}
                                  className="ml-1 opacity-75 hover:opacity-100 leading-none"
                                >×</button>
                              </span>
                            )
                          })}
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
                              onClick={async () => {
                                setGroupForm(f => ({ ...f, student_ids: [...f.student_ids, m.id] }))
                                setGroupStudentSearch('')
                                try {
                                  const { data } = await coachingAPI.getHoursBalance(m.id)
                                  setGroupStudentBalances(b => ({ ...b, [m.id]: data.groupBalance }))
                                } catch {}
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
                      <label className="block text-xs text-slate-200 mb-1">Starting week</label>
                      <input type="date" className="input w-full" value={groupForm.date}
                        onChange={e => setGroupForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-200 mb-1">Days of week</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{dow:1,label:'Mon'},{dow:2,label:'Tue'},{dow:3,label:'Wed'},{dow:6,label:'Sat'}].map(({dow,label}) => {
                          const active = groupForm.selectedDays.includes(dow)
                          return (
                            <button key={dow} type="button"
                              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                              onClick={() => setGroupForm(f => ({
                                ...f,
                                selectedDays: active
                                  ? f.selectedDays.filter(d => d !== dow)
                                  : [...f.selectedDays, dow]
                              }))}>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Leave all unselected to use the starting-week date as-is.</p>
                    </div>

                    {effectiveDows.length > 1 ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-200">Times per day</label>
                        {effectiveDows.map(dow => {
                          const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]
                          const slots = dow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                          const dt = groupForm.dayTimes[dow] || { start_time: '', end_time: '' }
                          const eSlots = slots.filter(s => !dt.start_time || toMins(s) > toMins(dt.start_time))
                          return (
                            <div key={dow} className="flex gap-2 items-center">
                              <span className="text-xs text-slate-400 w-8">{dayLabel}</span>
                              <select className="input text-xs py-1 flex-1" value={dt.start_time}
                                onChange={e => {
                                  const s = e.target.value
                                  const autoEnd = slots.find(t => toMins(t) === toMins(s) + 60) ?? ''
                                  setGroupForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { start_time: s, end_time: autoEnd } } }))
                                }}>
                                <option value="">Start…</option>
                                {slots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                              </select>
                              <select className="input text-xs py-1 flex-1" value={dt.end_time}
                                onChange={e => setGroupForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { ...dt, end_time: e.target.value } } }))}
                                disabled={!dt.start_time}>
                                <option value="">End…</option>
                                {eSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">Start Time</label>
                        <select className="input w-full" value={groupForm.start_time}
                          onChange={e => {
                            const s = e.target.value
                            const autoEnd = formSlots.find(t => toMins(t) === toMins(s) + 60) ?? ''
                            setGroupForm(f => ({ ...f, start_time: s, end_time: autoEnd }))
                          }}>
                          <option value="">Select…</option>
                          {formSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-200 mb-1">End Time</label>
                        <select className="input w-full" value={groupForm.end_time}
                          onChange={e => {
                            setGroupForm(f => ({ ...f, end_time: e.target.value }))
                          }}
                          disabled={!groupForm.start_time}>
                          <option value="">Select…</option>
                          {endSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                        </select>
                      </div>
                    </div>
                    )}

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

                    {(() => {
                      const mixed2 = effectiveDows.length > 1
                      const allTimesSet = mixed2
                        ? effectiveDows.every(d => groupForm.dayTimes[d]?.start_time && groupForm.dayTimes[d]?.end_time)
                        : (groupForm.start_time && groupForm.end_time)
                      if (!allTimesSet) return null
                      const numDays = effectiveDows.length || 1
                      const total = effectiveDows.reduce((sum, d) => {
                        const t = mixed2 ? groupForm.dayTimes[d] : { start_time: groupForm.start_time, end_time: groupForm.end_time }
                        return sum + (toMins(t.end_time) - toMins(t.start_time)) / 60 * groupForm.weeks
                      }, 0)
                      return (
                        <p className="text-xs text-slate-400">
                          Will credit <span className="font-medium text-white">{total.toFixed(1)} hrs</span> to each student
                          {numDays > 1 ? ` (${numDays} days/week × ${groupForm.weeks} week${groupForm.weeks > 1 ? 's' : ''})` : ` (${groupForm.weeks} week${groupForm.weeks > 1 ? 's' : ''})`}.
                          Deducted each time they attend.
                        </p>
                      )
                    })()}
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
                        {['Students / Hours', 'Coach', 'Time', 'Notes', 'Actions'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs text-slate-300 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupSessions.map(g => (
                        <React.Fragment key={g.group_id}>
                          <tr className="border-b border-court-light/50 last:border-0 hover:bg-court-light/30 transition-colors align-top">
                            <td className="px-5 py-3">
                              <div className="flex flex-col gap-1.5">
                                {g.student_names.map((name, i) => {
                                  const sid = g.student_ids?.[i]
                                  const bal = sid !== undefined ? sessionBalances[sid]?.group : undefined
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => sid !== undefined && handleOpenMemberModal(sid)}
                                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-70 self-start ${
                                        bal !== undefined && bal < 0
                                          ? 'bg-red-500/15 text-red-300'
                                          : bal !== undefined && bal < 1
                                            ? 'bg-amber-500/15 text-amber-300'
                                            : 'bg-brand-500/15 text-brand-300'
                                      }`}>
                                      {name}
                                      {bal !== undefined && (
                                        <span className="opacity-70">{bal.toFixed(1)}h</span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                            <td className="px-5 py-3 align-top">
                              <button onClick={() => { const ci = coaches.find(c => c.id === g.coach_id); setCoachViewModal({ coach_id: g.coach_id, coach_name: g.coach_name, email: ci?.email, phone: ci?.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                className="text-slate-300 hover:text-sky-400 transition-colors text-left">
                                {g.coach_name}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-slate-300 text-xs font-mono whitespace-nowrap align-top">
                              {fmtTime(g.start_time)} – {fmtTime(g.end_time)}
                            </td>

                            <td className="px-5 py-3 text-slate-400 text-xs max-w-[140px] truncate align-top">{g.notes ?? '—'}</td>
                            <td className="px-5 py-3 align-top">
                              <div className="flex flex-col gap-1.5">
                                {g.student_names.map((name, i) => {
                                  const sid       = g.student_ids?.[i]
                                  const sessionId = g.session_ids?.[i]
                                  const adminCI = g.admin_checked_ins?.[i] === true || (sessionId !== undefined && adminCheckedIn.has(sessionId))
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => adminCI
                                        ? handleAdminUndoCheckInCoaching(sessionId, sid)
                                        : handleAdminCheckInCoaching(sessionId, sid)
                                      }
                                      className={`text-xs text-left transition-colors whitespace-nowrap w-[150px] truncate ${adminCI ? 'text-sky-400 hover:text-red-400' : 'text-slate-400 hover:text-emerald-300'}`}
                                      title={adminCI ? 'Undo check-in' : 'Check in'}
                                    >{adminCI ? '✓ ' : ''}{name}</button>
                                  )
                                })}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <button
                                    onClick={() => { setGroupEditModal(g); setGroupEditAddSearch(''); setGroupEditSessionDate(null); setGroupEditForm({ date: '', start_time: '', end_time: '' }); setGroupEditSelected(new Set()) }}
                                    className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                                    Edit
                                  </button>
                                  <button onClick={() => handleCancelGroupSession(g.group_id)}
                                    className="text-xs text-red-400 hover:text-red-300 font-medium">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Hours sub-tab ── */}
          {coachingSubTab === 'hours' && (
            <div className="space-y-6">
              {/* Student search */}
              <div className="card space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">Student Hours Balance</h3>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Search member by name…"
                    value={hoursStudentSearch}
                    onChange={e => setHoursStudentSearch(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    disabled={hoursLoading}
                    onClick={async () => {
                      const q = hoursStudentSearch.trim().toLowerCase()
                      const match = members.find(m => m.name?.toLowerCase().includes(q))
                      if (!match) return
                      setHoursLoading(true)
                      try {
                        const { data } = await coachingAPI.getHoursBalance(match.id)
                        setHoursTarget({ user_id: match.id, name: match.name, soloBalance: data.soloBalance, groupBalance: data.groupBalance, ledger: data.ledger })
                        setHoursForm({ delta: '', note: '', session_type: 'solo' })
                      } finally { setHoursLoading(false) }
                    }}
                  >
                    Look Up
                  </button>
                </div>

                {/* Suggestions */}
                {hoursStudentSearch && (
                  <ul className="divide-y divide-court-light max-h-40 overflow-y-auto rounded-lg border border-court-light">
                    {members
                      .filter(m => m.name?.toLowerCase().includes(hoursStudentSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(m => (
                        <li key={m.id}>
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-court-light transition-colors"
                            onClick={async () => {
                              setHoursStudentSearch(m.name)
                              setHoursLoading(true)
                              try {
                                const { data } = await coachingAPI.getHoursBalance(m.id)
                                setHoursTarget({ user_id: m.id, name: m.name, soloBalance: data.soloBalance, groupBalance: data.groupBalance, ledger: data.ledger })
                                setHoursForm({ delta: '', note: '', session_type: 'solo' })
                              } finally { setHoursLoading(false) }
                            }}
                          >
                            {m.name}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* Balance display + manual adjustment */}
              {hoursTarget && (
                <div className="card space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{hoursTarget.name}</p>
                  </div>
                  {/* Split balance display */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-court rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">1-on-1</p>
                      <p className={`text-2xl font-bold ${(hoursTarget.soloBalance ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(hoursTarget.soloBalance ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">hrs</p>
                    </div>
                    <div className="bg-court rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Group</p>
                      <p className={`text-2xl font-bold ${(hoursTarget.groupBalance ?? 0) >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                        {(hoursTarget.groupBalance ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">hrs</p>
                    </div>
                  </div>

                  {/* Manual adjustment form */}
                  <div className="border-t border-court-light pt-4 space-y-2">
                    <p className="text-xs text-slate-400">Manual adjustment</p>
                    <div className="flex gap-2">
                      <select
                        className="input w-28 text-sm"
                        value={hoursForm.session_type}
                        onChange={e => setHoursForm(f => ({ ...f, session_type: e.target.value }))}>
                        <option value="solo">1-on-1</option>
                        <option value="group">Group</option>
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        className="input w-24"
                        placeholder="±hours"
                        value={hoursForm.delta}
                        onChange={e => setHoursForm(f => ({ ...f, delta: e.target.value }))}
                      />
                      <input
                        className="input flex-1"
                        placeholder="Note (optional)"
                        value={hoursForm.note}
                        onChange={e => setHoursForm(f => ({ ...f, note: e.target.value }))}
                      />
                      <button
                        className="btn-primary"
                        disabled={hoursLoading || !hoursForm.delta || hoursForm.delta === '0'}
                        onClick={async () => {
                          setHoursLoading(true)
                          try {
                            await coachingAPI.addHours(hoursTarget.user_id, {
                              delta: parseFloat(hoursForm.delta),
                              note: hoursForm.note || null,
                              session_type: hoursForm.session_type,
                            })
                            const { data } = await coachingAPI.getHoursBalance(hoursTarget.user_id)
                            setHoursTarget(prev => ({ ...prev, soloBalance: data.soloBalance, groupBalance: data.groupBalance, ledger: data.ledger }))
                            setHoursForm({ delta: '', note: '', session_type: hoursForm.session_type })
                          } finally { setHoursLoading(false) }
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Ledger */}
                  {hoursTarget.ledger?.length > 0 && (
                    <div className="border-t border-court-light pt-4">
                      <p className="text-xs text-slate-400 mb-2">Recent transactions</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-400 text-left">
                            <th className="py-1 pr-4">Date</th>
                            <th className="py-1 pr-3">Type</th>
                            <th className="py-1 pr-4">Hours</th>
                            <th className="py-1">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-court-light">
                          {hoursTarget.ledger.map(entry => (
                            <tr key={entry.id}>
                              <td className="py-1.5 pr-4 text-slate-400 whitespace-nowrap">
                                {new Date(entry.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="py-1.5 pr-3">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.session_type === 'group' ? 'bg-teal-500/15 text-teal-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                  {entry.session_type === 'group' ? 'Group' : '1-on-1'}
                                </span>
                              </td>
                              <td className={`py-1.5 pr-4 font-mono font-medium ${parseFloat(entry.delta) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {parseFloat(entry.delta) >= 0 ? '+' : ''}{parseFloat(entry.delta).toFixed(2)}
                              </td>
                              <td className="py-1.5 text-slate-300">{entry.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
            Sessions count only when <span className="text-white">an admin checks in</span> the student. Self check-ins by students or coaches do not count toward pay.
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
                                    {s.admin_checked_in
                                      ? <span className="text-sky-400">Admin ✓</span>
                                      : <span className="text-slate-500">Not checked in</span>
                                    }
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
                const timeEdit    = editingTimes[s.id]
                const detailEdit  = editingDetails[s.id]
                return (
                  <div key={s.id} className="card flex flex-col gap-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {detailEdit ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              className="input py-1 px-2 text-sm w-full"
                              value={detailEdit.title}
                              onChange={e => setEditingDetails(prev => ({ ...prev, [s.id]: { ...prev[s.id], title: e.target.value } }))}
                              placeholder="Session name"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                className="input py-1 px-2 text-xs"
                                value={detailEdit.date}
                                onChange={e => setEditingDetails(prev => ({ ...prev, [s.id]: { ...prev[s.id], date: e.target.value } }))}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">Max players</span>
                              <input
                                type="number"
                                min="1"
                                className="input py-1 px-2 text-xs w-20"
                                value={detailEdit.max_players}
                                onChange={e => setEditingDetails(prev => ({ ...prev, [s.id]: { ...prev[s.id], max_players: e.target.value } }))}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleSaveDetails(s.id)} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">Save</button>
                              <button onClick={() => setEditingDetails(prev => { const n = { ...prev }; delete n[s.id]; return n })} className="text-xs text-slate-400 hover:text-slate-200">✕</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-base">{s.title}</p>
                              {s.recurrence_id && (
                                <span className="text-[10px] uppercase tracking-widest text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full font-medium">
                                  Recurring
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-slate-300 font-medium">
                                {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </p>
                              <button
                                onClick={() => setEditingDetails(prev => ({ ...prev, [s.id]: { title: s.title, max_players: s.max_players, date: s.date } }))}
                                className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                              >
                                Edit
                              </button>
                            </div>
                            {s.description && (
                              <p className="text-sm text-slate-300 mt-1">{s.description}</p>
                            )}
                          </>
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
                        <span>
                          {s.online_count ?? s.participant_count} / {s.max_players} online
                          {s.walkin_count > 0 && <span className="text-slate-400"> · {s.walkin_count} walk-in</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-court-dark rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${(s.online_count ?? s.participant_count) / s.max_players >= 0.9 ? 'bg-red-500' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(Math.round((s.online_count ?? s.participant_count) / s.max_players * 100), 100)}%` }}
                        />
                      </div>
                      {/* Add member */}
                      {s.participant_count < s.max_players && (() => {
                        const existingIds = new Set(s.participants.map(p => p.id))
                        const picker = addingMember[s.id] ?? { query: '', userId: '' }
                        const suggestions = picker.query.length > 0
                          ? members.filter(m => !existingIds.has(m.id) && !m.is_walkin && m.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6)
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
                              <button
                                onClick={() => handleSocialAddWalkin(s.id)}
                                className="text-xs text-slate-400 hover:text-white font-medium whitespace-nowrap border border-slate-600 hover:border-slate-400 rounded px-2 py-1 transition-colors"
                              >+ Walk-in</button>
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
                      {/* Participant chips */}
                      {s.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {s.participants.map(p => (
                            <span key={p.id} className={`text-xs rounded-full px-2.5 py-0.5 flex items-center gap-1 ${p.is_walkin ? 'bg-slate-700 text-slate-400' : 'bg-court-light text-slate-300'}`}>
                              {p.name}
                              <button
                                onClick={() => handleSocialRemoveMember(s.id, p.id)}
                                className="text-slate-500 hover:text-red-400 transition-colors leading-none"
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
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

      {/* ── Member Activity Modal ─────────────────────────────────────────── */}
      {memberModal && (() => {
        const { member, bookings: mBookings, coaching: mCoaching, social: mSocial, coachSessions: mCoachSessions = [], soloBalance, groupBalance } = memberModal
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
               onClick={e => { if (e.target === e.currentTarget) { setMemberModal(null); setMemberModalEditId(null); setMemberModalSelected(new Set()) } }}>
            <div className="bg-court-mid border border-court-light rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-court-light shrink-0">
                <div>
                  <h2 className="text-white font-medium text-lg">{member.name}</h2>
                  <p className="text-slate-400 text-sm mt-0.5">{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`badge border text-xs ${
                      member.role === 'admin' ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                      : member.role === 'coach' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-court-light text-slate-400 border-court-light'}`}>
                      {member.role}
                    </span>
                    {soloBalance !== undefined && soloBalance !== 0 && (
                      <span className={`badge border text-xs ${soloBalance > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        1-on-1: {soloBalance.toFixed(1)} hrs
                      </span>
                    )}
                    {groupBalance !== undefined && groupBalance !== 0 && (
                      <span className={`badge border text-xs ${groupBalance > 0 ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        Group: {groupBalance.toFixed(1)} hrs
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => { setMemberModal(null); setMemberModalEditId(null); setMemberModalSelected(new Set()) }} className="text-slate-400 hover:text-white text-xl leading-none mt-1">✕</button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                {memberModalLoading ? (
                  <p className="text-slate-400 text-sm">Loading activities…</p>
                ) : memberModal.error ? (
                  <p className="text-red-400 text-sm">{memberModal.error}</p>
                ) : (() => {
                  const today = new Date().toISOString().slice(0, 10)

                  // Unified list grouped by badge type, then sorted by date within each group
                  const TYPE_ORDER = { booking: 0, teaching: 1, coaching: 2, social: 3 }

                  // Group coach's teaching sessions by date+time slot (collapses group sessions)
                  const teachingSlots = Object.values(
                    mCoachSessions.reduce((acc, s) => {
                      const key = `${String(s.date).slice(0,10)}_${s.start_time}`
                      if (!acc[key]) acc[key] = { _type: 'teaching', _date: String(s.date).slice(0,10), _key: `teach-${key}`, date: s.date, start_time: s.start_time, end_time: s.end_time, notes: s.notes, students: [] }
                      acc[key].students.push({ id: s.student_id, name: s.student_name, checked_in: s.checked_in })
                      return acc
                    }, {})
                  )

                  const allItems = [
                    ...mBookings.map(b => ({ _type: 'booking', _date: String(b.date).slice(0,10), _key: `b-${b.booking_group_id}`, ...b })),
                    ...teachingSlots,
                    ...mCoaching.map(s => ({ _type: 'coaching', _date: String(s.date).slice(0,10), _key: `c-${s.id}`, ...s })),
                    ...mSocial.map(s => ({ _type: 'social', _date: String(s.date).slice(0,10), _key: `sp-${s.id}`, ...s })),
                  ]
                  const byTypeDate = (dir) => (a, b) => {
                    const t = TYPE_ORDER[a._type] - TYPE_ORDER[b._type]
                    if (t !== 0) return t
                    return dir === 'asc'
                      ? (a._date < b._date ? -1 : a._date > b._date ? 1 : 0)
                      : (a._date > b._date ? -1 : a._date < b._date ? 1 : 0)
                  }
                  const upcomingItems = allItems.filter(i => i._date >= today).sort(byTypeDate('asc'))
                  const pastItems    = allItems.filter(i => i._date <  today).sort(byTypeDate('desc'))
                  const items = memberModalTab === 'upcoming' ? upcomingItems : pastItems

                  const upcomingCoaching = mCoaching.filter(s => s.date >= today)
                  const allUpcomingSelected = upcomingCoaching.length > 0 && upcomingCoaching.every(s => memberModalSelected.has(s.id))

                  return (
                    <>
                      {/* Tab bar */}
                      <div className="flex gap-1 border-b border-court-light -mx-6 px-6 mb-4">
                        {[['upcoming', 'Upcoming', upcomingItems.length], ['past', 'Past', pastItems.length]].map(([id, label, count]) => (
                          <button key={id} onClick={() => { setMemberModalTab(id); setMemberModalEditId(null); setMemberModalSelected(new Set()) }}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                              memberModalTab === id ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                            {label}
                            {count > 0 && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
                          </button>
                        ))}
                        {memberModalTab === 'upcoming' && upcomingCoaching.length > 1 && memberModalSelected.size === 0 && (
                          <button className="ml-auto text-xs text-slate-400 hover:text-white pb-2"
                            onClick={() => setMemberModalSelected(allUpcomingSelected ? new Set() : new Set(upcomingCoaching.map(s => s.id)))}>
                            {allUpcomingSelected ? 'Deselect all' : 'Select all coaching'}
                          </button>
                        )}
                      </div>

                      {items.length === 0 ? (
                        <p className="text-slate-500 text-sm">No sessions.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(() => {
                            const nonCoaching = items.filter(i => i._type !== 'coaching')
                            const oneOnOneItems = items.filter(i => i._type === 'coaching' && !i.group_id)
                            const groupItems = items.filter(i => i._type === 'coaching' && i.group_id)
                            return (
                              <>
                                {nonCoaching.map(item => {
                                  if (item._type === 'booking') return (
                                    <div key={item._key} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-court">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-[10px] bg-brand-500/15 text-brand-400 px-1.5 py-0.5 rounded shrink-0">Booking</span>
                                        <span className="text-sm font-medium text-white">{fmtDate(item.date)}</span>
                                        <span className="text-slate-400 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                      </div>
                                      {memberModalTab === 'upcoming' && (
                                        <button className="text-xs text-red-400 hover:text-red-300 ml-4 shrink-0"
                                          onClick={async () => {
                                            if (!window.confirm('Cancel this booking?')) return
                                            try {
                                              await bookingsAPI.cancelGroup(item.booking_group_id)
                                              setMemberModal(prev => ({ ...prev, bookings: prev.bookings.filter(x => x.booking_group_id !== item.booking_group_id) }))
                                            } catch { alert('Could not cancel booking.') }
                                          }}>Cancel</button>
                                      )}
                                    </div>
                                  )
                                  if (item._type === 'teaching') return (
                                    <div key={item._key} className="rounded-lg bg-court px-4 py-2.5 space-y-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded shrink-0">Teaching</span>
                                        <span className="text-sm font-medium text-white">{fmtDate(item.date)}</span>
                                        <span className="text-slate-400 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                        {item.notes && <span className="text-slate-500 text-xs">· {item.notes}</span>}
                                      </div>
                                      <div className="flex flex-wrap gap-2 pl-1">
                                        {item.students.map(st => (
                                          <div key={st.id} className="flex items-center gap-1.5 bg-court-light/40 rounded px-2.5 py-1">
                                            <span className="text-xs text-slate-200">{st.name}</span>
                                            {st.checked_in
                                              ? <span className="text-[10px] text-emerald-400 font-medium">✓</span>
                                              : <span className="text-[10px] text-slate-500">—</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                  if (item._type === 'social') return (
                                    <div key={item._key} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-court">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-[10px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded shrink-0">Social</span>
                                        <span className="text-sm font-medium text-white">{fmtDate(item.date)}</span>
                                        <span className="text-slate-400 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                      </div>
                                      {memberModalTab === 'upcoming' && (
                                        <button className="text-xs text-red-400 hover:text-red-300 ml-4 shrink-0"
                                          onClick={async () => {
                                            if (!window.confirm('Leave this social session?')) return
                                            try {
                                              await socialAPI.leave(item.id)
                                              setMemberModal(prev => ({ ...prev, social: prev.social.filter(x => x.id !== item.id) }))
                                            } catch { alert('Could not remove.') }
                                          }}>Remove</button>
                                      )}
                                    </div>
                                  )
                                  return null
                                })}
                                {oneOnOneItems.length > 0 && (
                                  <div className="rounded-lg border border-court-light/50 overflow-hidden">
                                    <button
                                      className="w-full flex items-center justify-between px-4 py-2.5 bg-court hover:bg-court-light/20 transition-colors"
                                      onClick={() => setMemberModalCoachingExpanded(p => !p)}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">Coaching</span>
                                        <span className="text-sm text-slate-300">{oneOnOneItems.length} session{oneOnOneItems.length !== 1 ? 's' : ''}</span>
                                        {[...new Set(oneOnOneItems.map(i => i.coach_name).filter(Boolean))].map(n => (
                                          <span key={n} className="text-xs text-slate-400">· {n}</span>
                                        ))}
                                      </div>
                                      <span className="text-slate-500 text-xs">{memberModalCoachingExpanded ? '▲' : '▼'}</span>
                                    </button>
                                    {memberModalCoachingExpanded && (
                                      <div className="border-t border-court-light/40 divide-y divide-court-light/30">
                                        {oneOnOneItems.map(item => {
                                          const isEditing  = memberModalEditId === item.id
                              const isSelected = memberModalSelected.has(item.id)
                              const seriesCount = item.recurrence_id
                                ? mCoaching.filter(x => x.recurrence_id === item.recurrence_id && x.date >= today).length
                                : 0
                              return (
                                <div key={item._key} className={`rounded-lg border ${isSelected ? 'border-sky-500/50 bg-sky-900/20' : 'border-transparent bg-court'}`}>
                                  <div className="flex items-center gap-3 px-4 py-2.5">
                                    {memberModalTab === 'upcoming' && (
                                      <input type="checkbox" className="shrink-0 accent-sky-500" checked={isSelected}
                                        onChange={e => setMemberModalSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(item.id) : n.delete(item.id); return n })} />
                                    )}
                                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${item.group_id ? 'bg-teal-500/15 text-teal-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{item.group_id ? 'Group' : 'Coaching'}</span>
                                      <span className="text-sm font-medium text-white">{fmtDate(item.date)}</span>
                                      <span className="text-slate-400 text-sm">{item.coach_name} · {fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                      {(item.checked_in || adminCheckedIn.has(item.id))
                                        ? <span className="text-emerald-400 text-xs font-medium">✓ Checked in</span>
                                        : memberModalTab === 'past' && <span className="text-slate-600 text-xs">Not checked in</span>}
                                      {item.notes && <span className="text-slate-500 text-xs w-full">{item.notes}</span>}
                                    </div>
                                    {memberModalTab === 'upcoming' && memberModalSelected.size === 0 && (
                                      <div className="flex gap-3 shrink-0">
                                        <button className={`text-xs ${isEditing ? 'text-slate-400 hover:text-white' : 'text-sky-400 hover:text-sky-300'}`}
                                          onClick={() => {
                                            if (isEditing) { setMemberModalEditId(null) } else {
                                              setMemberModalEditId(item.id)
                                              setMemberModalEditForm({ date: item.date.slice(0,10), start_time: item.start_time.slice(0,5), end_time: item.end_time.slice(0,5) })
                                            }
                                          }}>
                                          {isEditing ? 'Close' : 'Edit'}
                                        </button>
                                        <button className="text-xs text-red-400 hover:text-red-300"
                                          onClick={async () => {
                                            if (!window.confirm('Cancel this coaching session?')) return
                                            try {
                                              await coachingAPI.cancelSession(item.id)
                                              setMemberModal(prev => ({ ...prev, coaching: prev.coaching.filter(x => x.id !== item.id) }))
                                              if (memberModalEditId === item.id) setMemberModalEditId(null)
                                              if (!item.checked_in) {
                                                const hasMakeup = await offerMakeupSession(item, mCoaching)
                                                if (!hasMakeup) {
                                                  const hrs = (toMins(item.end_time.slice(0, 5)) - toMins(item.start_time.slice(0, 5))) / 60
                                                  await coachingAPI.addHours(member.id, { delta: -hrs, note: 'Session cancelled', session_type: item.group_id ? 'group' : 'solo' }).catch(() => {})
                                                } else {
                                                  // Refresh member modal to show new makeup session
                                                  const { data: fresh } = await adminAPI.getMemberActivities(member.id).catch(() => ({ data: null }))
                                                  if (fresh) setMemberModal(prev => ({ ...prev, coaching: fresh.coaching }))
                                                }
                                              }
                                              // Refresh balance
                                              coachingAPI.getHoursBalance(member.id).then(({ data: hd }) =>
                                                setMemberModal(prev => ({ ...prev, soloBalance: hd.soloBalance, groupBalance: hd.groupBalance }))
                                              ).catch(() => {})
                                            } catch { alert('Could not cancel session.') }
                                          }}>Cancel</button>
                                      </div>
                                    )}
                                  </div>
                                  {/* Inline edit form */}
                                  {isEditing && memberModalSelected.size === 0 && (
                                    <div className="px-4 pb-3 border-t border-court-light/40 space-y-2 pt-2">
                                      <div className="flex gap-2 flex-wrap">
                                        <div>
                                          <label className="block text-xs text-slate-400 mb-1">New date</label>
                                          <input type="date" className="input text-xs py-1" value={memberModalEditForm.date}
                                            onChange={e => setMemberModalEditForm(f => ({ ...f, date: e.target.value }))} />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-slate-400 mb-1">Start time</label>
                                          <select className="input text-xs py-1" value={memberModalEditForm.start_time}
                                            onChange={e => { const st = e.target.value; const et = st ? (ALL_SLOTS.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setMemberModalEditForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                            <option value="">Keep same</option>
                                            {ALL_SLOTS.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-slate-400 mb-1">End time</label>
                                          <select className="input text-xs py-1" value={memberModalEditForm.end_time}
                                            onChange={e => setMemberModalEditForm(f => ({ ...f, end_time: e.target.value }))}
                                            disabled={!memberModalEditForm.start_time}>
                                            <option value="">Keep same</option>
                                            {ALL_SLOTS.filter(sl => sl > memberModalEditForm.start_time).map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="flex gap-2 flex-wrap">
                                        <button disabled={memberModalEditSaving || !memberModalEditForm.date}
                                          className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                                          onClick={async () => {
                                            const { date, start_time, end_time } = memberModalEditForm
                                            const OPEN_DOW = new Set([1, 2, 3, 6])
                                            if (!OPEN_DOW.has(new Date(date+'T12:00:00Z').getUTCDay())) {
                                              const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                              alert(`${date} is a ${dayNames[new Date(date+'T12:00:00Z').getUTCDay()]} — club is closed. Open days are Mon, Tue, Wed, Sat.`)
                                              return
                                            }
                                            setMemberModalEditSaving(true)
                                            try {
                                              await coachingAPI.rescheduleSession(item.id, date, start_time || undefined, end_time || undefined)
                                              setMemberModal(prev => ({ ...prev, coaching: prev.coaching.map(x => x.id === item.id ? { ...x, date, ...(start_time ? { start_time: start_time+':00' } : {}), ...(end_time ? { end_time: end_time+':00' } : {}) } : x) }))
                                              setMemberModalEditId(null)
                                            } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
                                            finally { setMemberModalEditSaving(false) }
                                          }}>Save this session</button>
                                        {seriesCount > 1 && (
                                          <button disabled={memberModalEditSaving || !memberModalEditForm.date}
                                            className="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
                                            onClick={async () => {
                                              const OPEN_DOW = new Set([1, 2, 3, 6])
                                              const { date: newDate, start_time, end_time } = memberModalEditForm
                                              const futureSeries = mCoaching.filter(x => x.recurrence_id === item.recurrence_id && x.date >= today).sort((a,b) => a.date < b.date ? -1 : 1)
                                              const deltaDays = Math.round((new Date(newDate+'T12:00:00Z') - new Date(item.date.slice(0,10)+'T12:00:00Z')) / 86400000)
                                              const idx = futureSeries.findIndex(x => x.id === item.id)
                                              const updates = futureSeries.slice(idx).map(x => {
                                                const d = new Date(x.date.slice(0,10)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+deltaDays)
                                                const u = { id: x.id, date: d.toISOString().slice(0,10) }
                                                if (start_time && end_time) { u.start_time = start_time; u.end_time = end_time }
                                                return u
                                              })
                                              const closed = updates.filter(u => !OPEN_DOW.has(new Date(u.date+'T12:00:00Z').getUTCDay()))
                                              if (closed.length > 0) {
                                                const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                                const badDates = closed.map(u => `${u.date} (${dayNames[new Date(u.date+'T12:00:00Z').getUTCDay()]})`).join(', ')
                                                alert(`Cannot shift to closed day${closed.length > 1 ? 's' : ''}: ${badDates}.\nOpen days are Mon, Tue, Wed, Sat.`)
                                                return
                                              }
                                              setMemberModalEditSaving(true)
                                              try {
                                                await coachingAPI.rescheduleBulk(updates)
                                                const updMap = Object.fromEntries(updates.map(u => [u.id, u]))
                                                setMemberModal(prev => ({ ...prev, coaching: prev.coaching.map(x => updMap[x.id] ? { ...x, date: updMap[x.id].date, ...(updMap[x.id].start_time ? { start_time: updMap[x.id].start_time+':00' } : {}), ...(updMap[x.id].end_time ? { end_time: updMap[x.id].end_time+':00' } : {}) } : x) }))
                                                setMemberModalEditId(null)
                                              } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
                                              finally { setMemberModalEditSaving(false) }
                                            }}>Save from here ({seriesCount} sessions)</button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {groupItems.length > 0 && (
                                  <div className="rounded-lg border border-court-light/50 overflow-hidden">
                                    <button
                                      className="w-full flex items-center justify-between px-4 py-2.5 bg-court hover:bg-court-light/20 transition-colors"
                                      onClick={() => setMemberModalGroupExpanded(p => !p)}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded">Group</span>
                                        <span className="text-sm text-slate-300">{groupItems.length} session{groupItems.length !== 1 ? 's' : ''}</span>
                                        {[...new Set(groupItems.map(i => i.coach_name).filter(Boolean))].map(n => (
                                          <span key={n} className="text-xs text-slate-400">· {n}</span>
                                        ))}
                                      </div>
                                      <span className="text-slate-500 text-xs">{memberModalGroupExpanded ? '▲' : '▼'}</span>
                                    </button>
                                    {memberModalGroupExpanded && (
                                      <div className="border-t border-court-light/40 divide-y divide-court-light/30">
                                        {groupItems.map(item => {
                                          const isEditing = memberModalEditId === item.id
                                          const isSelected = memberModalSelected.has(item.id)
                                          return (
                                            <div key={item._key} className={`rounded-lg border ${isSelected ? 'border-sky-500/50 bg-sky-900/20' : 'border-transparent bg-court'}`}>
                                              <div className="flex items-center gap-3 px-4 py-2.5">
                                                {memberModalTab === 'upcoming' && (
                                                  <input type="checkbox" className="shrink-0 accent-sky-500" checked={isSelected}
                                                    onChange={e => setMemberModalSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(item.id) : n.delete(item.id); return n })} />
                                                )}
                                                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                                  <span className="text-[10px] bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded shrink-0">Group</span>
                                                  <span className="text-sm font-medium text-white">{fmtDate(item.date)}</span>
                                                  <span className="text-slate-400 text-sm">{item.coach_name} · {fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                                  {(item.checked_in || adminCheckedIn.has(item.id))
                                                    ? <span className="text-emerald-400 text-xs font-medium">✓ Checked in</span>
                                                    : memberModalTab === 'past' && <span className="text-slate-600 text-xs">Not checked in</span>}
                                                  {item.notes && <span className="text-slate-500 text-xs w-full">{item.notes}</span>}
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {/* Bulk edit bar (upcoming coaching only) */}
                      {memberModalTab === 'upcoming' && memberModalSelected.size > 0 && (() => {
                        const selSessions = mCoaching.filter(s => memberModalSelected.has(s.id))
                        const bulkValidSlots = ALL_SLOTS.filter(sl => selSessions.every(s => {
                          const dow = new Date(s.date.slice(0,10)+'T12:00:00Z').getUTCDay()
                          return dow === 6 ? SATURDAY_SLOTS.includes(sl) : WEEKDAY_SLOTS.includes(sl)
                        }))
                        return (
                        <div className="mt-3 bg-sky-900/30 border border-sky-500/30 rounded-lg px-4 py-3 space-y-3">
                          <p className="text-sky-300 text-sm font-medium">{memberModalSelected.size} session{memberModalSelected.size > 1 ? 's' : ''} selected</p>
                          <div className="flex gap-2 flex-wrap items-end">
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Shift by days</label>
                              <input type="number" className="input text-xs py-1 w-24" placeholder="0"
                                value={memberModalBulkForm.offsetDays}
                                onChange={e => setMemberModalBulkForm(f => ({ ...f, offsetDays: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">New start time</label>
                              <select className="input text-xs py-1" value={memberModalBulkForm.start_time}
                                onChange={e => { const st = e.target.value; const et = st ? (bulkValidSlots.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setMemberModalBulkForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                <option value="">Keep same</option>
                                {bulkValidSlots.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">New end time</label>
                              <select className="input text-xs py-1" value={memberModalBulkForm.end_time}
                                onChange={e => setMemberModalBulkForm(f => ({ ...f, end_time: e.target.value }))}
                                disabled={!memberModalBulkForm.start_time}>
                                <option value="">Keep same</option>
                                {bulkValidSlots.filter(sl => sl > memberModalBulkForm.start_time).map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button disabled={memberModalEditSaving} className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                              onClick={async () => {
                                const OPEN_DOW = new Set([1, 2, 3, 6])
                                const offset = parseInt(memberModalBulkForm.offsetDays, 10) || 0
                                const { start_time, end_time } = memberModalBulkForm
                                const selectedSessions = mCoaching.filter(s => memberModalSelected.has(s.id))
                                const updates = selectedSessions.map(s => {
                                  const d = new Date(s.date.slice(0,10)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+offset)
                                  const u = { id: s.id, date: d.toISOString().slice(0,10) }
                                  if (start_time && end_time) { u.start_time = start_time; u.end_time = end_time }
                                  return u
                                })
                                const closed = updates.filter(u => !OPEN_DOW.has(new Date(u.date+'T12:00:00Z').getUTCDay()))
                                if (closed.length > 0) {
                                  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                  const badDates = closed.map(u => `${u.date} (${dayNames[new Date(u.date+'T12:00:00Z').getUTCDay()]})`).join(', ')
                                  alert(`Cannot shift to closed day${closed.length > 1 ? 's' : ''}: ${badDates}.\nOpen days are Mon, Tue, Wed, Sat.`)
                                  return
                                }
                                setMemberModalEditSaving(true)
                                try {
                                  await coachingAPI.rescheduleBulk(updates)
                                  const updMap = Object.fromEntries(updates.map(u => [u.id, u]))
                                  setMemberModal(prev => ({ ...prev, coaching: prev.coaching.map(x => updMap[x.id] ? { ...x, date: updMap[x.id].date, ...(updMap[x.id].start_time ? { start_time: updMap[x.id].start_time+':00' } : {}), ...(updMap[x.id].end_time ? { end_time: updMap[x.id].end_time+':00' } : {}) } : x) }))
                                  setMemberModalSelected(new Set())
                                  setMemberModalBulkForm({ offsetDays: '0', start_time: '', end_time: '' })
                                } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
                                finally { setMemberModalEditSaving(false) }
                              }}>
                              {memberModalEditSaving ? 'Saving…' : `Apply to ${memberModalSelected.size} session${memberModalSelected.size > 1 ? 's' : ''}`}
                            </button>
                            <button disabled={memberModalEditSaving}
                              className="text-xs text-red-400 hover:text-red-300 py-1 px-3 border border-red-500/30 rounded disabled:opacity-50"
                              onClick={async () => {
                                if (!window.confirm(`Cancel ${memberModalSelected.size} session${memberModalSelected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
                                setMemberModalEditSaving(true)
                                try {
                                  const selectedSessions = mCoaching.filter(s => memberModalSelected.has(s.id))
                                  await Promise.all([...memberModalSelected].map(id => coachingAPI.cancelSession(id)))
                                  const totalHrs = selectedSessions.reduce((sum, s) => {
                                    return sum + (toMins(s.end_time.slice(0, 5)) - toMins(s.start_time.slice(0, 5))) / 60
                                  }, 0)
                                  if (totalHrs > 0)
                                    await coachingAPI.addHours(member.id, { delta: -totalHrs, note: `${selectedSessions.length} session${selectedSessions.length > 1 ? 's' : ''} cancelled` }).catch(() => {})
                                  setMemberModal(prev => ({ ...prev, coaching: prev.coaching.filter(x => !memberModalSelected.has(x.id)) }))
                                  setMemberModalSelected(new Set())
                                  setMemberModalBulkForm({ offsetDays: '0', start_time: '', end_time: '' })
                                  // Refresh balance
                                  coachingAPI.getHoursBalance(member.id).then(({ data: hd }) =>
                                    setMemberModal(prev => ({ ...prev, soloBalance: hd.soloBalance, groupBalance: hd.groupBalance }))
                                  ).catch(() => {})
                                } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel sessions.') }
                                finally { setMemberModalEditSaving(false) }
                              }}>
                              Cancel {memberModalSelected.size} session{memberModalSelected.size > 1 ? 's' : ''}
                            </button>
                            <button className="btn-secondary text-xs py-1 px-3"
                              onClick={() => { setMemberModalSelected(new Set()); setMemberModalBulkForm({ offsetDays: '0', start_time: '', end_time: '' }) }}>
                              Clear
                            </button>
                          </div>
                        </div>
                      )
                      })()}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* ── Coach Modal ──────────────────────────────────────────────────── */}
      {coachViewModal && (() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const coachSessions = allCoachingSessions.filter(s => s.coach_id === coachViewModal.coach_id)

        // Collapse individual session rows into series (group by group_id or recurrence_id)
        function collapseSeries(sessions) {
          const map = {}
          for (const s of sessions) {
            const key = s.group_id
              ? `group_${s.group_id}`
              : s.recurrence_id
              ? `solo_${s.recurrence_id}`
              : `solo_${s.id}`
            if (!map[key]) map[key] = { ...s, seriesKey: key, students: new Set(), dates: [], rawSessions: [], checkedInCount: 0, totalCount: 0 }
            map[key].students.add(s.student_name)
            map[key].dates.push(s.date?.slice(0, 10))
            map[key].rawSessions.push(s)
            map[key].totalCount++
            if (s.admin_checked_in || adminCheckedIn.has(s.id)) map[key].checkedInCount++
          }
          return Object.values(map).map(g => ({ ...g, students: [...g.students].sort(), dates: g.dates.sort() }))
        }

        const upcoming = collapseSeries(coachSessions.filter(s => s.date?.slice(0, 10) >= todayISO))
          .sort((a, b) => a.dates[0] < b.dates[0] ? -1 : 1)
        const past     = collapseSeries(coachSessions.filter(s => s.date?.slice(0, 10) <  todayISO))
          .sort((a, b) => a.dates[a.dates.length - 1] > b.dates[b.dates.length - 1] ? -1 : 1)
        const tab      = coachViewExpanded.has('past') ? 'past' : 'upcoming'
        const items    = tab === 'upcoming' ? upcoming : past

        const totalStudents = [...new Set(coachSessions.map(s => s.student_id))].length

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
               onClick={() => { setCoachViewModal(null); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}>
            <div className="bg-court-mid border border-court-light rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-court-light shrink-0">
                <div>
                  <h2 className="text-white font-medium text-lg">{coachViewModal.coach_name}</h2>
                  <p className="text-slate-400 text-sm mt-0.5">
                    {[coachViewModal.email, coachViewModal.phone, `${totalStudents} student${totalStudents !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button onClick={() => { setCoachViewModal(null); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                  className="text-slate-400 hover:text-white text-xl leading-none mt-1">✕</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-court-light px-6">
                {[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]].map(([id, label, count]) => (
                  <button key={id}
                    onClick={() => { setCoachViewExpanded(id === 'past' ? new Set(['past']) : new Set()); setCoachSeriesExpanded(new Set()) }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}>
                    {label}{count > 0 && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
                  </button>
                ))}
              </div>

              {/* Session list */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
                {items.length === 0 ? (
                  <p className="text-slate-500 text-sm">No {tab} sessions.</p>
                ) : items.map((s, i) => {
                  const firstDate    = s.dates[0]
                  const lastDate     = s.dates[s.dates.length - 1]
                  const isMulti      = s.dates.length > 1
                  const seriesAllPast = lastDate < todayISO
                  const isExpanded   = coachSeriesExpanded.has(s.seriesKey)
                  const dateLabel    = isMulti
                    ? `${fmtDate(firstDate)} – ${fmtDate(lastDate)}`
                    : fmtDate(firstDate)

                  // Build per-date sub-rows for expanded view
                  const dateMap = {}
                  for (const r of s.rawSessions) {
                    const d = r.date?.slice(0, 10)
                    if (!dateMap[d]) dateMap[d] = { date: d, students: [], checkedCount: 0, total: 0 }
                    dateMap[d].students.push(r.student_name)
                    dateMap[d].total++
                    if (r.admin_checked_in || adminCheckedIn.has(r.id)) dateMap[d].checkedCount++
                  }
                  const dateRows = Object.values(dateMap).sort((a, b) =>
                    tab === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
                  )

                  return (
                    <div key={i} className="border-b border-court-light/30 last:border-0">
                      {/* Series header row */}
                      <button
                        onClick={() => setCoachSeriesExpanded(prev => {
                          const next = new Set(prev)
                          next.has(s.seriesKey) ? next.delete(s.seriesKey) : next.add(s.seriesKey)
                          return next
                        })}
                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-court-light/20 rounded transition-colors">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wide shrink-0 ${
                          s.group_id ? 'bg-teal-500/15 text-teal-400' : 'bg-emerald-500/15 text-emerald-400'
                        }`}>{s.group_id ? 'Group' : 'Coaching'}</span>
                        <span className={`text-sm flex-1 min-w-0 ${seriesAllPast ? 'text-slate-400' : 'text-white'}`}>
                          {dateLabel} · {s.students.join(', ')}
                          {isMulti && <span className="text-xs text-slate-500 ml-1.5">({s.totalCount})</span>}
                        </span>
                        <span className="text-xs text-slate-500 font-mono shrink-0">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                        {tab === 'past' && (
                          s.checkedInCount > 0
                            ? <span className="text-emerald-400 text-xs shrink-0 ml-2">✓ {s.checkedInCount}/{s.totalCount}</span>
                            : <span className="text-slate-600 text-xs shrink-0 ml-2">No show</span>
                        )}
                        {isMulti && (
                          <span className="text-slate-500 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                        )}
                      </button>

                      {/* Expanded per-date rows */}
                      {isExpanded && (
                        <div className="ml-4 mb-2 space-y-0.5">
                          {dateRows.map(dr => (
                            <div key={dr.date} className="flex items-center gap-3 py-1.5 pl-3 border-l border-court-light/40">
                              <span className={`text-xs flex-1 ${dr.date < todayISO ? 'text-slate-500' : 'text-slate-300'}`}>
                                {fmtDate(dr.date)}
                                {s.group_id && <span className="text-slate-600 ml-1.5">· {dr.students.join(', ')}</span>}
                              </span>
                              {dr.date < todayISO && (
                                dr.checkedCount > 0
                                  ? <span className="text-emerald-400 text-xs shrink-0">✓ {dr.checkedCount > 1 ? `${dr.checkedCount}/${dr.total}` : 'In'}</span>
                                  : <span className="text-slate-600 text-xs shrink-0">No show</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Solo Session Edit Modal ──────────────────────────────────────── */}
      {soloEditModal && (() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const s0 = soloEditModal
        // All upcoming confirmed 1-on-1 sessions for this student+coach (across all series/days)
        const seriesSessions = allCoachingSessions.filter(s =>
          s.student_id === s0.student_id && s.coach_id === s0.coach_id && !s.group_id && s.date?.slice(0, 10) >= todayISO
        )
        const sorted = [...seriesSessions].sort((a, b) => a.date < b.date ? -1 : 1)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) setSoloEditModal(null) }}>
            <div className="bg-court-dark border border-court-light rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-6 pb-4 border-b border-court-light flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-white">Edit Sessions</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s0.student_name} · Coach: {s0.coach_name} · {sorted.length} upcoming session{sorted.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setSoloEditModal(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-6">
                {sorted.length === 0 ? (
                  <p className="text-slate-400 text-sm">No upcoming sessions in this series.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm text-slate-200">Upcoming Sessions</h3>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                          onClick={() => {
                            if (soloEditSelected.size === sorted.length) setSoloEditSelected(new Set())
                            else setSoloEditSelected(new Set(sorted.map(s => s.id)))
                          }}>
                          {soloEditSelected.size === sorted.length ? 'Deselect all' : 'Select all'}
                        </button>
                        {soloEditSelected.size > 0 && (
                          <button
                            className="text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 hover:text-red-300 px-3 py-1 rounded-full transition-colors"
                            onClick={() => handleSoloBulkCancel([...soloEditSelected])}>
                            Cancel {soloEditSelected.size} selected
                          </button>
                        )}
                      </div>
                    </div>
                    {sorted.map(s => {
                      const isSelected = soloEditSelected.has(s.id)
                      const checkedIn = s.checked_in || adminCheckedIn.has(s.id)
                      return (
                        <div key={s.id} className={`rounded-lg border px-4 py-2.5 flex items-center gap-3 ${isSelected ? 'border-red-500/40 bg-red-900/10' : 'border-transparent bg-court'}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => setSoloEditSelected(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(s.id); else next.delete(s.id)
                              return next
                            })}
                            className="w-4 h-4 accent-red-500 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white">{fmtDate(s.date?.slice(0, 10))}</span>
                            <span className="text-slate-400 text-xs font-mono">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                            {checkedIn && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">Checked in</span>}
                            {s.notes && <span className="text-[10px] text-slate-500 truncate max-w-[160px]">{s.notes}</span>}
                          </div>
                          {!isSelected && (
                            <button
                              className="text-xs text-red-400 hover:text-red-300 shrink-0"
                              onClick={async () => {
                                await handleCancelSession(s.id)
                                // Close modal if no sessions remain for this student+coach
                                const remaining = allCoachingSessions.filter(x =>
                                  x.student_id === s0.student_id && x.coach_id === s0.coach_id && !x.group_id && x.id !== s.id
                                )
                                if (remaining.length === 0) setSoloEditModal(null)
                              }}>
                              Cancel
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-court-light shrink-0 flex justify-end">
                <button onClick={() => setSoloEditModal(null)} className="btn-secondary text-sm">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Group Edit Modal ─────────────────────────────────────────────── */}
      {groupEditModal && (() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const g = groupEditModal
        // Build date → sessions map for this group (upcoming only)
        const dateMap = {}
        for (const s of allCoachingSessions) {
          if (s.group_id !== g.group_id) continue
          const d = s.date?.slice(0, 10)
          if (!d || d < todayISO) continue
          if (!dateMap[d]) dateMap[d] = []
          dateMap[d].push(s)
        }
        const uniqueDates = Object.keys(dateMap).sort()
        // Representative session for time/coach display
        const sample = dateMap[uniqueDates[0]]?.[0] ?? g
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-court-dark border border-court-light rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Fixed header */}
              <div className="p-6 pb-4 border-b border-court-light flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-white">Edit Group Session</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtTime(g.start_time)} – {fmtTime(g.end_time)} · Coach: {g.coach_name}</p>
                </div>
                <button onClick={() => setGroupEditModal(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {/* Sessions list */}
                {uniqueDates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm text-slate-200">Upcoming Sessions</h3>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                          onClick={() => {
                            if (groupEditSelected.size === uniqueDates.length) setGroupEditSelected(new Set())
                            else setGroupEditSelected(new Set(uniqueDates))
                          }}>
                          {groupEditSelected.size === uniqueDates.length ? 'Deselect all' : 'Select all'}
                        </button>
                        {groupEditSelected.size > 0 && (
                          <button
                            className="text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 hover:text-red-300 px-3 py-1 rounded-full transition-colors"
                            onClick={() => handleBulkCancelSelectedDates(dateMap)}>
                            Cancel {groupEditSelected.size} selected
                          </button>
                        )}
                      </div>
                    </div>
                    {uniqueDates.map((date, idx) => {
                      const rep = dateMap[date][0]
                      const isEditing = groupEditSessionDate === date
                      const isSelected = groupEditSelected.has(date)
                      const sessionCount = uniqueDates.length - idx
                      return (
                        <div key={date} className={`rounded-lg border ${isEditing ? 'border-sky-500/40 bg-sky-900/10' : isSelected ? 'border-red-500/40 bg-red-900/10' : 'border-transparent bg-court'}`}>
                          <div className="flex items-center gap-3 px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => setGroupEditSelected(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(date); else next.delete(date)
                                return next
                              })}
                              className="w-4 h-4 accent-red-500 shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">Group</span>
                              <span className="text-sm text-white">{fmtDate(date)}</span>
                              <span className="text-slate-400 text-sm">{g.coach_name} · {fmtTime(rep.start_time)}–{fmtTime(rep.end_time)}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {!isEditing && !isSelected && (
                                <button
                                  className="text-xs text-red-400 hover:text-red-300"
                                  onClick={() => handleCancelEntireSessionDate(date, dateMap[date])}>
                                  Cancel session
                                </button>
                              )}
                              {!isSelected && (
                                <button
                                  className={`text-xs ${isEditing ? 'text-slate-400 hover:text-white' : 'text-sky-400 hover:text-sky-300'}`}
                                  onClick={() => {
                                    if (isEditing) { setGroupEditSessionDate(null) } else {
                                      setGroupEditSessionDate(date)
                                      setGroupEditForm({ date, start_time: rep.start_time.slice(0, 5), end_time: rep.end_time.slice(0, 5) })
                                    }
                                  }}>
                                  {isEditing ? 'Close' : 'Edit'}
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Per-student rows */}
                          {!isEditing && !isSelected && (
                            <div className="px-4 pb-2 space-y-1 border-t border-court-light/30 pt-2">
                              {dateMap[date].map(s => {
                                const leaveCount = (g.group_leave_map ?? {})[String(s.student_id)] ?? 0
                                const leaveUsed = leaveCount >= 2
                                const sStart = s.start_time?.slice(0, 5)
                                const sEnd = s.end_time?.slice(0, 5)
                                const rescheduled = sStart !== rep.start_time?.slice(0, 5) || sEnd !== rep.end_time?.slice(0, 5)
                                return (
                                  <div key={s.id} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                      <span className="text-xs text-slate-400">{s.student_name}</span>
                                      {rescheduled && (
                                        <span className="text-[10px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded shrink-0">
                                          {fmtTime(sStart)}–{fmtTime(sEnd)}
                                        </span>
                                      )}
                                      {leaveCount > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${leaveUsed ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                          {leaveCount}/2 leaves
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        disabled={leaveUsed}
                                        title={leaveUsed ? 'Student has already used their leave for this series' : 'Cancel this session (records a leave)'}
                                        className={`text-xs ${leaveUsed ? 'text-slate-600 cursor-not-allowed' : 'text-amber-400 hover:text-amber-300'}`}
                                        onClick={() => !leaveUsed && handleCancelStudentOnDate(s)}>
                                        {leaveUsed ? 'No leaves left' : 'Leave'}
                                      </button>
                                      <button
                                        title={`Remove ${s.student_name} from this and all future sessions`}
                                        className="text-xs text-red-400 hover:text-red-300"
                                        onClick={() => handleGroupEditRemoveStudentFromDate(date, s.student_id, s.student_name)}>
                                        Remove ↓
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                              {/* Per-date add student */}
                              {(() => {
                                const search = dateAddSearch[date] ?? ''
                                const isAdding = date in dateAddSearch
                                const alreadyInGroup = new Set(dateMap[date].map(s => s.student_id))
                                return (
                                  <div className="pt-1">
                                    {!isAdding ? (
                                      <button
                                        className="text-xs text-sky-400 hover:text-sky-300"
                                        onClick={() => setDateAddSearch(prev => ({ ...prev, [date]: '' }))}>
                                        + Add student from here
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <input
                                          autoFocus
                                          className="input text-xs py-1 w-40"
                                          placeholder="Student name…"
                                          value={search}
                                          onChange={e => setDateAddSearch(prev => ({ ...prev, [date]: e.target.value }))}
                                        />
                                        <button
                                          className="text-xs text-slate-400 hover:text-white"
                                          onClick={() => setDateAddSearch(prev => { const n = { ...prev }; delete n[date]; return n })}>
                                          ✕
                                        </button>
                                        {search && (
                                          <ul className="w-full mt-1 divide-y divide-court-light max-h-32 overflow-y-auto rounded-lg border border-court-light bg-court-dark">
                                            {members
                                              .filter(m => m.name?.toLowerCase().includes(search.toLowerCase()) && !alreadyInGroup.has(m.id))
                                              .slice(0, 6)
                                              .map(m => (
                                                <li key={m.id}>
                                                  <button
                                                    disabled={dateAddSaving}
                                                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-court-light/40"
                                                    onClick={() => {
                                                      if (!window.confirm(`Add ${m.name} to all sessions from ${fmtDate(date)} onwards? Their hours balance will be updated.`)) return
                                                      handleGroupEditAddStudentFromDate(date, m.id)
                                                    }}>
                                                    {m.name}
                                                  </button>
                                                </li>
                                              ))}
                                          </ul>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                          {/* Inline edit form */}
                          {isEditing && (
                            <div className="px-4 pb-3 border-t border-court-light/40 space-y-2 pt-2">
                              <div className="flex gap-2 flex-wrap">
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">New date</label>
                                  <input type="date" className="input text-xs py-1" value={groupEditForm.date}
                                    onChange={e => setGroupEditForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">Start time</label>
                                  <select className="input text-xs py-1" value={groupEditForm.start_time}
                                    onChange={e => { const st = e.target.value; const et = st ? (ALL_SLOTS.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setGroupEditForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                    <option value="">Keep same</option>
                                    {ALL_SLOTS.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">End time</label>
                                  <select className="input text-xs py-1" value={groupEditForm.end_time}
                                    onChange={e => setGroupEditForm(f => ({ ...f, end_time: e.target.value }))}
                                    disabled={!groupEditForm.start_time}>
                                    <option value="">Keep same</option>
                                    {ALL_SLOTS.filter(sl => sl > groupEditForm.start_time).map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  disabled={groupEditSaving || !groupEditForm.date}
                                  className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                                  onClick={() => handleGroupDateSaveOne(date)}>
                                  Save this session
                                </button>
                                {sessionCount > 1 && (
                                  <button
                                    disabled={groupEditSaving || !groupEditForm.date}
                                    className="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
                                    onClick={() => handleGroupDateSaveFromHere(date)}>
                                    Save from here ({sessionCount} sessions)
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {uniqueDates.length === 0 && (
                  <p className="text-slate-500 text-sm">No upcoming sessions.</p>
                )}
              </div>

              {/* Fixed footer */}
              <div className="p-4 border-t border-court-light shrink-0 flex justify-end">
                <button onClick={() => setGroupEditModal(null)} className="btn-secondary text-sm">Close</button>
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
                      {['', '#', 'Current Date', 'Time', 'New Date', 'Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rescheduleModal.sessions.map((s, i) => {
                      const isPast    = s.date?.slice(0, 10) < todayISO
                      const newDate   = rescheduleDates[s.id] ?? ''
                      const isChecked = rescheduleSelected.has(s.id)
                      return (
                        <tr key={s.id} className={`border-b border-court-light/40 last:border-0 ${isPast ? 'opacity-40' : ''} ${isChecked ? 'bg-brand-500/5' : ''}`}>
                          <td className="pl-3 py-2.5">
                            {!isPast && (
                              <input type="checkbox" checked={isChecked}
                                onChange={() => setRescheduleSelected(prev => {
                                  const n = new Set(prev)
                                  n.has(s.id) ? n.delete(s.id) : n.add(s.id)
                                  return n
                                })} />
                            )}
                          </td>
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

              <div className="flex items-center justify-between pt-1 border-t border-court-light">
                <div className="flex items-center gap-3">
                  {rescheduleSelected.size > 0 && (
                    <button
                      disabled={rescheduleSaving}
                      onClick={handleMoveSelected}
                      className="btn-primary text-xs py-1 px-3 disabled:opacity-50">
                      {rescheduleSaving ? 'Saving…' : `Move ${rescheduleSelected.size} selected`}
                    </button>
                  )}
                  <button
                    className="text-xs text-slate-500 hover:text-slate-300"
                    onClick={() => {
                      const upcomingIds = rescheduleModal.sessions
                        .filter(s => s.date?.slice(0, 10) >= todayISO)
                        .map(s => s.id)
                      setRescheduleSelected(prev =>
                        prev.size === upcomingIds.length ? new Set() : new Set(upcomingIds)
                      )
                    }}>
                    {rescheduleSelected.size > 0 ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <button onClick={() => setRescheduleModal(null)} className="btn-secondary text-sm">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Social Calendar Edit Modal ──────────────────────────────────── */}
      {socialCalendarEdit && (() => {
        const e = socialCalendarEdit
        const lastMins  = slotsForDay.length ? toMins(slotsForDay[slotsForDay.length - 1]) + 30 : 1230
        const closingT  = `${String(Math.floor(lastMins/60)).padStart(2,'0')}:${String(lastMins%60).padStart(2,'0')}`
        const allSlots  = [...slotsForDay, closingT]
        const endSlots  = allSlots.filter(t => toMins(t) > toMins(e.start_time))
        const autoEnd   = (ns) => {
          const pref = toMins(ns) + 60
          const key  = `${String(Math.floor(pref/60)).padStart(2,'0')}:${String(pref%60).padStart(2,'0')}`
          const opts = allSlots.filter(t => toMins(t) > toMins(ns))
          return opts.includes(key) ? key : (opts[0] ?? ns)
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={f => { if (f.target === f.currentTarget) setSocialCalendarEdit(null) }}>
            <div className="bg-court-dark border border-court-light rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="p-5 pb-4 border-b border-court-light flex items-center justify-between">
                <h2 className="text-white text-base">Edit Social Play</h2>
                <button onClick={() => setSocialCalendarEdit(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Name</label>
                  <input type="text" className="input w-full text-sm"
                    value={e.title}
                    onChange={f => setSocialCalendarEdit(prev => ({ ...prev, title: f.target.value }))} />
                </div>
                {/* Date */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" className="input w-full text-sm"
                    value={e.date}
                    onChange={f => setSocialCalendarEdit(prev => ({ ...prev, date: f.target.value }))} />
                </div>
                {/* Time */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Time</label>
                  <div className="flex items-center gap-2">
                    <select className="input flex-1 text-sm"
                      value={e.start_time}
                      onChange={f => { const ns = f.target.value; setSocialCalendarEdit(prev => ({ ...prev, start_time: ns, end_time: autoEnd(ns) })) }}>
                      {allSlots.slice(0,-1).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                    </select>
                    <span className="text-slate-400 text-xs">–</span>
                    <select className="input flex-1 text-sm"
                      value={e.end_time}
                      onChange={f => setSocialCalendarEdit(prev => ({ ...prev, end_time: f.target.value }))}>
                      {endSlots.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                    </select>
                  </div>
                </div>
                {/* Courts + Max players */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Courts</label>
                    <input type="number" min="1" max="6" className="input w-full text-sm"
                      value={e.num_courts}
                      onChange={f => setSocialCalendarEdit(prev => ({ ...prev, num_courts: f.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Max players</label>
                    <input type="number" min="1" className="input w-full text-sm"
                      value={e.max_players}
                      onChange={f => setSocialCalendarEdit(prev => ({ ...prev, max_players: f.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5 flex justify-end gap-3">
                <button onClick={() => setSocialCalendarEdit(null)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={handleSocialCalendarEditSave} disabled={e.saving} className="btn-primary text-sm">{e.saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
