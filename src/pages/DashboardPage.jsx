import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import SocialPlayCard from '@/components/common/SocialPlayCard'
import { bookingsAPI, coachingAPI, socialAPI, membersAPI, checkinAPI } from '@/api/api'

function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapBooking(b) {
  return {
    id:        b.id,
    groupId:   b.booking_group_id,
    court:     b.court_name,
    date:      b.date,
    startTime: b.start_time,
    endTime:   b.end_time,
    duration:  toMins(b.end_time) - toMins(b.start_time),
    status:    b.status ?? 'confirmed',
  }
}

const QUICK_STATS = [
  { key: 'bookings',    label: 'Court Bookings',  icon: '🏓' },
  { key: 'tournaments', label: 'Tournaments',     icon: '🥇' },
]

// ── Calendar constants ──────────────────────────────────────────────────────

const CAL_DAYS = [
  { label: 'Monday',    short: 'Mon', dow: 1 },
  { label: 'Tuesday',   short: 'Tue', dow: 2 },
  { label: 'Wednesday', short: 'Wed', dow: 3 },
  { label: 'Saturday',  short: 'Sat', dow: 6 },
]

const ROW_H = 34          // px per 30-min slot
const CAL_START = 720     // 12:00 in minutes
const CAL_END   = 1260    // 21:00 in minutes  (last bookable slot starts at 20:00, must be visible)
const SLOT_COUNT = (CAL_END - CAL_START) / 30  // 18 slots

// Active hours per dow (minutes from midnight)
const ACTIVE = {
  1: [930, 1230],  // Mon  15:30–20:30
  2: [930, 1230],  // Tue
  3: [930, 1230],  // Wed
  6: [720, 1050],  // Sat  12:00–17:30
}

// Build time-slot metadata once
const TIME_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const mins = CAL_START + i * 30
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return {
    mins,
    // Show label only on the hour
    label: m === 0 ? `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}` : '',
  }
})

// Rolling 4-week window starting from the current Monday.
// Avoids the old month-boundary bug where bookings in the last ~2 weeks
// of the month (made up to 14 days ahead) would fall off the calendar.
function getRollingWeeks() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() || 7          // 1=Mon … 7=Sun
  d.setDate(d.getDate() - (dow - 1))   // rewind to Monday
  const weeks = []
  for (let i = 0; i < 4; i++) {
    const monday = new Date(d)
    const week   = {}
    CAL_DAYS.forEach(({ dow: cd }) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + (cd - 1))  // Mon+0, Tue+1, Wed+2, Sat+5
      week[cd] = date
    })
    weeks.push(week)
    d.setDate(d.getDate() + 7)
  }
  return weeks
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const [bookings,         setBookings]         = useState([])
  const [coachingSessions, setCoachingSessions] = useState([])
  const [coachSessions,    setCoachSessions]    = useState([])
  const [socialSessions,   setSocialSessions]   = useState([])
  const [stats,            setStats]            = useState({ bookings: 0, tournaments: 0 })
  const [checkedIn,        setCheckedIn]        = useState(new Set()) // "type:refId" keys
  const [loadingData,      setLoadingData]      = useState(false)

  // Rolling weeks — week 0 is always the current week, so no getCurrentWeekIdx needed
  const weeks          = useMemo(() => getRollingWeeks(), [])
  const [selectedWeek, setSelectedWeek] = useState(0)
  const autoJumped     = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoadingData(true)
    Promise.allSettled([
      bookingsAPI.getMyBookings(),
      coachingAPI.getMySessions(),
      coachingAPI.getMyCoachSessions(),
      socialAPI.getSessions(),
      user?.id ? membersAPI.getStats(user.id) : Promise.reject(),
      checkinAPI.getToday(),
    ])
      .then(([bookingRes, coachingRes, coachRes, socialRes, statsRes, checkinRes]) => {
        if (cancelled) return
        if (bookingRes.status === 'fulfilled')
          setBookings(bookingRes.value.data.bookings.map(mapBooking))
        if (coachingRes.status === 'fulfilled')
          setCoachingSessions(coachingRes.value.data.sessions)
        if (coachRes.status === 'fulfilled')
          setCoachSessions(coachRes.value.data.sessions)
        if (socialRes.status === 'fulfilled')
          setSocialSessions(socialRes.value.data.sessions)
        if (statsRes.status === 'fulfilled')
          setStats(statsRes.value.data)
        if (checkinRes.status === 'fulfilled')
          setCheckedIn(new Set(
            checkinRes.value.data.checkIns.map(ci => `${ci.type}:${ci.reference_id}`)
          ))
      })
      .finally(() => { if (!cancelled) setLoadingData(false) })
    return () => { cancelled = true }
  }, [user?.id])

  // Once data loads, jump to the week containing the nearest upcoming event
  useEffect(() => {
    if (autoJumped.current) return
    const today = toISO(new Date())
    const dates = [
      ...bookings.filter(b => b.status !== 'cancelled').map(b => b.date?.slice(0, 10)),
      ...coachingSessions.map(s => s.date?.slice(0, 10)),
      ...coachSessions.map(s => s.date?.slice(0, 10)),
      ...socialSessions.filter(s => s.joined).map(s => s.date?.slice(0, 10)),
    ].filter(d => d && d >= today).sort()
    if (!dates.length) return
    const nearest = dates[0]
    const idx = weeks.findIndex(week => Object.values(week).some(d => toISO(d) === nearest))
    if (idx >= 0) {
      setSelectedWeek(idx)
      autoJumped.current = true
    }
  }, [bookings, coachingSessions, coachSessions, socialSessions, weeks])

  const handleCancelBooking = async (booking) => {
    try {
      if (booking.groupId) {
        await bookingsAPI.cancelGroup(booking.groupId)
        setBookings(prev => prev.filter(b => b.groupId !== booking.groupId))
      } else {
        await bookingsAPI.cancel(booking.id)
        setBookings(prev => prev.filter(b => b.id !== booking.id))
      }
    } catch {
      alert('Could not cancel booking. Please try again.')
    }
  }

  const handleCancelCoaching = async (id) => {
    if (!window.confirm('Cancel this coaching session?')) return
    try {
      await coachingAPI.cancelSession(id)
      setCoachingSessions(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('Could not cancel coaching session. Please try again.')
    }
  }

  const handleCancelCoachSession = async (id) => {
    if (!window.confirm('Cancel this coaching session?')) return
    try {
      await coachingAPI.cancelSession(id)
      setCoachSessions(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('Could not cancel session. Please try again.')
    }
  }

  const handleLeaveSocialSession = async (id) => {
    if (!window.confirm('Leave this social play session?')) return
    try {
      await socialAPI.leave(id)
      setSocialSessions(prev => prev.map(s =>
        s.id === id
          ? { ...s, joined: false, participant_count: Math.max(0, s.participant_count - 1) }
          : s
      ))
    } catch {
      alert('Could not leave session. Please try again.')
    }
  }

  const handleCheckIn = async (type, refId) => {
    try {
      if (type === 'booking')  await checkinAPI.checkInBooking(refId)
      if (type === 'coaching') await checkinAPI.checkInCoaching(refId)
      if (type === 'social')   await checkinAPI.checkInSocial(refId)
      setCheckedIn(prev => new Set([...prev, `${type}:${refId}`]))
    } catch {
      alert('Could not check in. Please try again.')
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const currentWeekDates = weeks[selectedWeek] ?? weeks[0]
  const todayISO         = toISO(new Date())

  // Activities that have a check-in button today
  const todayActivities = useMemo(() => {
    const acts = []
    bookings
      .filter(b => b.date?.slice(0, 10) === todayISO && b.status !== 'cancelled')
      .forEach(b => acts.push({
        type: 'booking', refId: b.groupId,
        title: 'Court Booking', subtitle: b.court,
        time: `${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`,
      }))
    coachingSessions
      .filter(s => s.date?.slice(0, 10) === todayISO)
      .forEach(s => acts.push({
        type: 'coaching', refId: String(s.id),
        title: 'Coaching Session', subtitle: `w/ ${s.coach_name}`,
        time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
      }))
    coachSessions
      .filter(s => s.date?.slice(0, 10) === todayISO)
      .forEach(s => acts.push({
        type: 'coaching', refId: String(s.id),
        title: 'Teaching Session', subtitle: `→ ${s.student_name}`,
        time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
      }))
    socialSessions
      .filter(s => s.joined && s.date?.slice(0, 10) === todayISO)
      .forEach(s => acts.push({
        type: 'social', refId: String(s.id),
        title: s.title || 'Social Play',
        subtitle: `${s.participant_count}/${s.max_players} players`,
        time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
      }))
    return acts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, coachingSessions, coachSessions, socialSessions, todayISO])

  // Collect all events for a given date ISO string
  function getEvents(dateISO) {
    const events = []
    bookings
      .filter(b => b.date?.slice(0, 10) === dateISO && b.status !== 'cancelled')
      .forEach(b => events.push({ id: `bk-${b.id}`, type: 'booking', data: b }))
    coachingSessions
      .filter(s => s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `cs-${s.id}`, type: 'student', data: s }))
    coachSessions
      .filter(s => s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `ck-${s.id}`, type: 'coach', data: s }))
    socialSessions
      .filter(s => s.joined && s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `sp-${s.id}`, type: 'social', data: s }))
    return events
  }

  const EVENT_STYLES = {
    booking: { bg: 'bg-brand-500/90 border-brand-400',    text: 'text-white' },
    student: { bg: 'bg-emerald-600/90 border-emerald-400', text: 'text-white' },
    coach:   { bg: 'bg-sky-600/90 border-sky-400',         text: 'text-white' },
    social:  { bg: 'bg-orange-500/90 border-orange-400',   text: 'text-white' },
  }

  return (
    <div className="page-wrapper py-8 px-4 max-w-7xl mx-auto space-y-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">{greeting()},</p>
          <h1 className="font-display text-4xl text-white tracking-wider">{user?.name ?? 'Player'}</h1>
        </div>
        <Link to="/booking" className="btn-primary">+ Book a Court</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 max-w-sm">
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

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Calendar ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">

          {/* Header + week selector */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-normal text-white">My Schedule</h2>
            <div className="flex gap-1.5">
              {weeks.map((weekDates, i) => {
                const hasEvents = Object.values(weekDates).some(date => {
                  const iso = toISO(date)
                  return bookings.some(b => b.date?.slice(0, 10) === iso && b.status !== 'cancelled')
                    || coachingSessions.some(s => s.date?.slice(0, 10) === iso)
                    || coachSessions.some(s => s.date?.slice(0, 10) === iso)
                    || socialSessions.some(s => s.joined && s.date?.slice(0, 10) === iso)
                })
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedWeek(i); autoJumped.current = true }}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      selectedWeek === i
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white'
                    }`}
                  >
                    Week {i + 1}
                    {hasEvents && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Calendar card */}
          <div className="card p-0 overflow-hidden">

            {/* Day-header row */}
            <div
              className="grid border-b border-court-light"
              style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}
            >
              <div /> {/* corner */}
              {CAL_DAYS.map(({ short, dow }) => {
                const date    = currentWeekDates[dow]
                const dateISO = toISO(date)
                const isToday = dateISO === todayISO
                return (
                  <div
                    key={dow}
                    className={`py-2.5 text-center border-l border-court-light ${isToday ? 'bg-brand-500/10' : ''}`}
                  >
                    <p className={`text-[11px] font-normal uppercase tracking-wide ${isToday ? 'text-brand-400' : 'text-slate-500'}`}>
                      {short}
                    </p>
                    <p className={`text-base font-normal leading-tight ${isToday ? 'text-brand-300' : 'text-white'}`}>
                      {date.getDate()}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {date.toLocaleDateString('en-AU', { month: 'short' })}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Grid body */}
            <div
              className="grid"
              style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}
            >
              {/* Time labels column */}
              <div className="border-r border-court-light/30">
                {TIME_SLOTS.map(({ mins, label }) => (
                  <div
                    key={mins}
                    style={{ height: ROW_H }}
                    className="flex items-start justify-end pr-1.5 pt-0.5"
                  >
                    {label && (
                      <span className="text-[10px] text-slate-600 leading-none whitespace-nowrap">
                        {label}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {CAL_DAYS.map(({ dow }) => {
                const date            = currentWeekDates[dow]
                const dateISO         = toISO(date)
                const isToday         = dateISO === todayISO
                const [actStart, actEnd] = ACTIVE[dow]
                const events          = getEvents(dateISO)
                const totalH          = SLOT_COUNT * ROW_H

                return (
                  <div
                    key={dow}
                    className={`relative border-l border-court-light overflow-hidden ${isToday ? 'bg-brand-500/[0.04]' : ''}`}
                    style={{ height: totalH }}
                  >
                    {/* Background slot rows */}
                    {TIME_SLOTS.map(({ mins }) => {
                      const isActive = mins >= actStart && mins < actEnd
                      const isHour   = mins % 60 === 0
                      return (
                        <div
                          key={mins}
                          className={`absolute left-0 right-0 border-b ${
                            isHour ? 'border-court-light/30' : 'border-court-light/10'
                          } ${isActive ? '' : 'bg-slate-950/50'}`}
                          style={{
                            top:    (mins - CAL_START) / 30 * ROW_H,
                            height: ROW_H,
                          }}
                        />
                      )
                    })}

                    {/* Loading shimmer */}
                    {loadingData && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-slate-700 animate-pulse">loading</span>
                      </div>
                    )}

                    {/* Events */}
                    {events.map(({ id, type, data }) => {
                      const startTime = type === 'booking' ? data.startTime : data.start_time
                      const endTime   = type === 'booking' ? data.endTime   : data.end_time
                      const startMins = toMins(startTime)
                      const endMins   = toMins(endTime)
                      const top       = (startMins - CAL_START) / 30 * ROW_H
                      const height    = Math.max((endMins - startMins) / 30 * ROW_H - 2, 18)
                      const { bg, text } = EVENT_STYLES[type]

                      const title = type === 'booking'
                        ? data.court
                        : type === 'student'
                          ? `w/ ${data.coach_name}`
                          : type === 'coach'
                            ? `→ ${data.student_name}`
                            : data.title || 'Social Play'

                      const onCancel = (e) => {
                        e.stopPropagation()
                        if (type === 'booking')      handleCancelBooking(data)
                        else if (type === 'student') handleCancelCoaching(data.id)
                        else if (type === 'coach')   handleCancelCoachSession(data.id)
                        else                         handleLeaveSocialSession(data.id)
                      }

                      return (
                        <div
                          key={id}
                          className={`absolute left-0.5 right-0.5 rounded border ${bg} ${text} text-[10px] leading-tight overflow-hidden group`}
                          style={{ top: top + 1, height }}
                          title={`${title} · ${fmtTime(startTime)}–${fmtTime(endTime)}`}
                        >
                          <div className="p-1 h-full flex flex-col justify-between">
                            <p className="font-normal truncate">{title}</p>
                            {height > 38 && (
                              <p className="opacity-70 truncate">{fmtTime(startTime)}</p>
                            )}
                          </div>
                          {/* Cancel button — visible on hover */}
                          <button
                            onClick={onCancel}
                            className="absolute top-0.5 right-0.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded bg-black/40 hover:bg-black/60 text-white leading-none"
                            title="Cancel"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-5 mt-2.5">
            {[
              { label: 'Court Booking',    color: 'bg-brand-500'   },
              { label: 'Coaching Session', color: 'bg-emerald-600' },
              { label: 'Teaching Session', color: 'bg-sky-600'     },
              { label: 'Social Play',      color: 'bg-orange-500'  },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                <span className="text-[11px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Today's Check-In */}
          {todayActivities.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-normal text-white mb-3">Today's Check-In</h3>
              <div className="divide-y divide-court-light">
                {todayActivities.map(act => {
                  const key  = `${act.type}:${act.refId}`
                  const done = checkedIn.has(key)
                  return (
                    <div key={key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{act.title}</p>
                        <p className="text-xs text-slate-500 truncate">{act.subtitle} · {act.time}</p>
                      </div>
                      {done ? (
                        <span className="text-xs text-emerald-400 font-normal flex-shrink-0">✓ Checked In</span>
                      ) : (
                        <button
                          onClick={() => handleCheckIn(act.type, act.refId)}
                          className="btn-primary text-xs py-1 px-3 flex-shrink-0"
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Social Play */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-normal text-white">Social Play</h2>
              <Link to="/social-play" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
            </div>
            {socialSessions.length === 0 ? (
              <p className="text-xs text-slate-500">No upcoming social play sessions.</p>
            ) : (
              <div className="space-y-3">
                {[...socialSessions]
                  .sort((a, b) => {
                    const dt = s => new Date(`${s.date}T${s.end_time}`)
                    const now = Date.now()
                    const aPast = dt(a) < now
                    const bPast = dt(b) < now
                    if (aPast !== bPast) return aPast ? 1 : -1
                    return dt(a) - dt(b)
                  })
                  .slice(0, 3)
                  .map(s => {
                    const isPast = new Date(`${s.date}T${s.end_time}`) < new Date()
                    return (
                      <SocialPlayCard
                        key={s.id}
                        session={s}
                        isAuthenticated={true}
                        isPast={isPast}
                        onJoin={() => socialAPI.join(s.id).then(() => socialAPI.getSessions().then(({ data }) => setSocialSessions(data.sessions)))}
                        onLeave={() => socialAPI.leave(s.id).then(() => socialAPI.getSessions().then(({ data }) => setSocialSessions(data.sessions)))}
                      />
                    )
                  })}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="card">
            <h3 className="text-sm font-normal text-white mb-3">Quick Links</h3>
            <nav className="space-y-1">
              {[
                ['Profile Settings', '/profile'],
                ['Book a Court',     '/booking'],
                ['Social Play',      '/social-play'],
              ].map(([label, to]) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center justify-between py-2 text-sm text-slate-400 hover:text-white border-b border-court-light last:border-0 transition-colors"
                >
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
