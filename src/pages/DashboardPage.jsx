import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { coachingAPI, socialAPI, checkinAPI } from '@/api/api'

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

// ── Calendar constants ──────────────────────────────────────────────────────

const CAL_DAYS = [
  { label: 'Monday',    short: 'Mon', dow: 1 },
  { label: 'Tuesday',   short: 'Tue', dow: 2 },
  { label: 'Wednesday', short: 'Wed', dow: 3 },
  { label: 'Saturday',  short: 'Sat', dow: 6 },
]

const CHECKIN_DOWS = [1, 2, 3, 6] // Mon, Tue, Wed, Sat

const ROW_H = 34          // px per 30-min slot
const CAL_START = 720     // 12:00 in minutes
const CAL_END   = 1260    // 21:00 in minutes
const SLOT_COUNT = (CAL_END - CAL_START) / 30  // 18 slots

// Build time-slot metadata once
const TIME_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const mins = CAL_START + i * 30
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return {
    mins,
    label: m === 0 ? `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}` : '',
  }
})

// Rolling 4-week window starting from the current Monday.
function getRollingWeeks() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() || 7
  d.setDate(d.getDate() - (dow - 1))
  const weeks = []
  for (let i = 0; i < 4; i++) {
    const monday = new Date(d)
    const week   = {}
    CAL_DAYS.forEach(({ dow: cd }) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + (cd - 1))
      week[cd] = date
    })
    weeks.push(week)
    d.setDate(d.getDate() + 7)
  }
  return weeks
}

// Format a week's date range label, e.g. "Mar 10 – 16" or "Mar 28 – Apr 3"
function fmtWeekRange(weekDates) {
  const mon = weekDates[1]
  const sat = weekDates[6]
  const monStr = mon.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  const satStr = mon.getMonth() === sat.getMonth()
    ? sat.getDate()
    : sat.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  return `${monStr} – ${satStr}`
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const [coachingSessions, setCoachingSessions] = useState([])
  const [coachSessions,    setCoachSessions]    = useState([])
  const [socialSessions,   setSocialSessions]   = useState([])
  const [checkedIn,        setCheckedIn]        = useState(new Set())
  const [hoursBalance,     setHoursBalance]     = useState(null)

  const [loadingData,      setLoadingData]      = useState(false)

  // Check-in day picker — default to today if it's a club day, else Monday of current week
  const todayDow = new Date().getDay() || 7
  const defaultDow = CHECKIN_DOWS.includes(todayDow) ? todayDow : 1
  const [selectedCheckInDay, setSelectedCheckInDay] = useState(defaultDow)
  const [activeTab, setActiveTab] = useState('checkin')

  // Rolling weeks for calendar
  const weeks          = useMemo(() => getRollingWeeks(), [])
  const [selectedWeek, setSelectedWeek] = useState(0)
  const autoJumped     = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoadingData(true)
    Promise.allSettled([
      coachingAPI.getMySessions(),
      coachingAPI.getMyCoachSessions(),
      socialAPI.getSessions(),
      checkinAPI.getToday(),
      user?.id ? coachingAPI.getHoursBalance(user.id) : Promise.resolve(null),
    ])
      .then(([coachingRes, coachRes, socialRes, checkinRes, hoursRes]) => {
        if (cancelled) return
        if (coachingRes.status === 'fulfilled')
          setCoachingSessions(coachingRes.value.data.sessions)
        if (coachRes.status === 'fulfilled')
          setCoachSessions(coachRes.value.data.sessions)
        if (socialRes.status === 'fulfilled')
          setSocialSessions(socialRes.value.data.sessions.filter(s => s.joined))
        if (checkinRes.status === 'fulfilled')
          setCheckedIn(new Set(
            checkinRes.value.data.checkIns.map(ci => `${ci.type}:${ci.reference_id}`)
          ))
        if (hoursRes?.status === 'fulfilled' && hoursRes.value)
          setHoursBalance({ solo: hoursRes.value.data.soloBalance ?? 0, group: hoursRes.value.data.groupBalance ?? 0 })
      })
      .finally(() => { if (!cancelled) setLoadingData(false) })
    return () => { cancelled = true }
  }, [user?.id])

  // Once data loads, jump to the week containing the nearest upcoming event
  useEffect(() => {
    if (autoJumped.current) return
    const today = toISO(new Date())
    const dates = [
      ...coachingSessions.map(s => s.date?.slice(0, 10)),
      ...coachSessions.map(s => s.date?.slice(0, 10)),
      ...socialSessions.map(s => s.date?.slice(0, 10)),
    ].filter(d => d && d >= today).sort()
    if (!dates.length) return
    const nearest = dates[0]
    const idx = weeks.findIndex(week => Object.values(week).some(d => toISO(d) === nearest))
    if (idx >= 0) {
      setSelectedWeek(idx)
      autoJumped.current = true
    }
  }, [coachingSessions, coachSessions, socialSessions, weeks])


  const currentWeekDates = weeks[selectedWeek] ?? weeks[0]
  const todayISO         = toISO(new Date())

  // Activities for the selected check-in day (always from current week)
  const checkInDateISO = useMemo(() => toISO(weeks[0][selectedCheckInDay]), [weeks, selectedCheckInDay])

  const dayActivities = useMemo(() => {
    const acts = []
    coachingSessions
      .filter(s => s.date?.slice(0, 10) === checkInDateISO)
      .forEach(s => acts.push({
        type: 'coaching', refId: String(s.id),
        title: 'Coaching Session', subtitle: `w/ ${s.coach_name}`,
        date: checkInDateISO,
        time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
      }))
    coachSessions
      .filter(s => s.date?.slice(0, 10) === checkInDateISO)
      .forEach(s => acts.push({
        type: 'coaching', refId: String(s.id),
        title: 'Teaching Session', subtitle: `→ ${s.student_name}`,
        date: checkInDateISO,
        time: `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
      }))
    return acts.sort((a, b) => a.time.localeCompare(b.time))
  }, [coachingSessions, coachSessions, checkInDateISO])

  // Collect all events for a given date ISO string
  function getEvents(dateISO) {
    const events = []
    coachingSessions
      .filter(s => s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `cs-${s.id}`, type: 'student', data: s }))
    coachSessions
      .filter(s => s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `ck-${s.id}`, type: 'coach', data: s }))
    socialSessions
      .filter(s => s.date?.slice(0, 10) === dateISO)
      .forEach(s => events.push({ id: `sp-${s.id}`, type: 'social', data: s }))
    return events
  }

  const EVENT_STYLES = {
    student: { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300' },
    coach:   { bg: 'bg-sky-500/15 border-sky-500/40',         text: 'text-sky-300'     },
    social:  { bg: 'bg-violet-500/15 border-violet-500/40',   text: 'text-violet-300'  },
  }

  return (
    <div className="page-wrapper py-8 px-4 max-w-4xl mx-auto">

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-court-light">
        {[
          { id: 'checkin',  label: 'Check-In' },
          { id: 'schedule', label: 'My Schedule' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-brand-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Check-In + Sessions Left ─────────────────────────────── */}
      {activeTab === 'checkin' && (
        <div className="space-y-6 animate-fade-in">

          {/* Coaching hours balance */}
          {hoursBalance !== null && (
            <div className="card">
              <h3 className="text-sm font-normal text-white mb-4">Coaching Hours</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-court-mid rounded-lg p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">1-on-1</p>
                  <p className={`font-display text-3xl tracking-wider leading-none ${(hoursBalance.solo ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(hoursBalance.solo ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">hrs remaining</p>
                </div>
                <div className="bg-court-mid rounded-lg p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Group</p>
                  <p className={`font-display text-3xl tracking-wider leading-none ${(hoursBalance.group ?? 0) >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                    {(hoursBalance.group ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">hrs remaining</p>
                </div>
              </div>
            </div>
          )}

          {/* Check-In */}
          <div className="card">
            <h3 className="text-sm font-normal text-white mb-3">Check-In</h3>
            <div className="flex gap-1.5 mb-4">
              {CHECKIN_DOWS.map(dow => {
                const date    = weeks[0][dow]
                const dateISO = toISO(date)
                const isToday = dateISO === todayISO
                const dayLabel = date.toLocaleDateString('en-AU', { weekday: 'short' })
                const dateNum  = date.getDate()
                return (
                  <button
                    key={dow}
                    onClick={() => setSelectedCheckInDay(dow)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all relative flex flex-col items-center leading-tight ${
                      selectedCheckInDay === dow
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white'
                    }`}
                  >
                    <span>{dayLabel}</span>
                    <span className={`text-xs ${selectedCheckInDay === dow ? 'text-white/80' : 'text-slate-500'}`}>{dateNum}</span>
                    {isToday && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </button>
                )
              })}
            </div>
            {dayActivities.length === 0 ? (
              <p className="text-sm text-slate-500">No sessions scheduled.</p>
            ) : (
              <div className="divide-y divide-court-light">
                {dayActivities.map(act => {
                  const key     = `${act.type}:${act.refId}`
                  const done    = checkedIn.has(key)
                  const isToday = act.date === todayISO
                  return (
                    <div key={key} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{act.title}</p>
                          <p className="text-sm text-slate-400 truncate">{act.subtitle}</p>
                          <p className="text-sm text-slate-500">{act.time}</p>
                        </div>
                        {done ? (
                          <span className="text-xs text-emerald-400 flex-shrink-0">✓ Checked In</span>
                        ) : (
                          <span className="text-xs text-slate-600 flex-shrink-0">Upcoming</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="card">
            <h3 className="text-sm font-normal text-white mb-3">Quick Links</h3>
            <nav className="space-y-1">
              {[['Profile Settings', '/profile'], ['Social Play', '/social-play']].map(([label, to]) => (
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
      )}

      {/* ── Tab 2: Weekly Schedule ───────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="animate-fade-in">

          {/* Week selector */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {weeks.map((weekDates, i) => {
                const hasEvents = Object.values(weekDates).some(date => {
                  const iso = toISO(date)
                  return coachingSessions.some(s => s.date?.slice(0, 10) === iso)
                    || coachSessions.some(s => s.date?.slice(0, 10) === iso)
                    || socialSessions.some(s => s.date?.slice(0, 10) === iso)
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
                    {fmtWeekRange(weekDates)}
                    {hasEvents && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Calendar card */}
          <div className="card p-0 overflow-hidden">
            <div className="grid border-b border-court-light" style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}>
              <div />
              {CAL_DAYS.map(({ short, dow }) => {
                const date    = currentWeekDates[dow]
                const dateISO = toISO(date)
                const isToday = dateISO === todayISO
                return (
                  <div key={dow} className={`py-2.5 text-center border-l border-court-light ${isToday ? 'bg-brand-500/10' : ''}`}>
                    <p className={`text-xs font-normal uppercase tracking-wide ${isToday ? 'text-brand-400' : 'text-slate-500'}`}>{short}</p>
                    <p className={`text-base font-normal leading-tight ${isToday ? 'text-brand-300' : 'text-white'}`}>{date.getDate()}</p>
                    <p className="text-xs text-slate-600">{date.toLocaleDateString('en-AU', { month: 'short' })}</p>
                  </div>
                )
              })}
            </div>
            <div className="grid" style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}>
              <div className="border-r border-court-light/30">
                {TIME_SLOTS.map(({ mins, label }) => (
                  <div key={mins} style={{ height: ROW_H }} className="flex items-start justify-end pr-1.5 pt-0.5">
                    {label && <span className="text-xs text-slate-600 leading-none whitespace-nowrap">{label}</span>}
                  </div>
                ))}
              </div>
              {CAL_DAYS.map(({ dow }) => {
                const date    = currentWeekDates[dow]
                const dateISO = toISO(date)
                const isToday = dateISO === todayISO
                const events  = getEvents(dateISO)
                const totalH  = SLOT_COUNT * ROW_H
                return (
                  <div key={dow} className={`relative border-l border-court-light overflow-hidden ${isToday ? 'bg-brand-500/[0.04]' : ''}`} style={{ height: totalH }}>
                    {TIME_SLOTS.map(({ mins }) => (
                      <div key={mins} className="absolute left-0 right-0 border-b border-court-light/20" style={{ top: (mins - CAL_START) / 30 * ROW_H, height: ROW_H }} />
                    ))}
                    {loadingData && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-slate-700 animate-pulse">loading</span>
                      </div>
                    )}
                    {events.map(({ id, type, data }) => {
                      const startMins = toMins(data.start_time)
                      const endMins   = toMins(data.end_time)
                      const top       = (startMins - CAL_START) / 30 * ROW_H
                      const height    = Math.max((endMins - startMins) / 30 * ROW_H - 2, 18)
                      const { bg, text } = EVENT_STYLES[type]
                      const title = type === 'student' ? `w/ ${data.coach_name}` : type === 'coach' ? `→ ${data.student_name}` : data.title || 'Social Play'
                      return (
                        <div key={id} className={`absolute left-0.5 right-0.5 rounded border ${bg} ${text} text-xs leading-tight overflow-hidden`} style={{ top: top + 1, height }} title={`${title} · ${fmtTime(data.start_time)}–${fmtTime(data.end_time)}`}>
                          <div className="p-1 h-full flex flex-col justify-between">
                            <p className="font-normal truncate">{title}</p>
                            {height > 38 && <p className="opacity-70 truncate">{fmtTime(data.start_time)}</p>}
                          </div>
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
              { label: 'Coaching Session', color: 'bg-emerald-500/60' },
              { label: 'Teaching Session', color: 'bg-sky-500/60' },
              { label: 'Social Play',      color: 'bg-violet-500/60' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
