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

const CAL_DAYS = [
  { label: 'Monday',    short: 'Mon', dow: 1 },
  { label: 'Tuesday',   short: 'Tue', dow: 2 },
  { label: 'Wednesday', short: 'Wed', dow: 3 },
  { label: 'Saturday',  short: 'Sat', dow: 6 },
]

const CHECKIN_DOWS = [1, 2, 3, 6]

const ROW_H = 34
const CAL_START = 720
const CAL_END   = 1260
const SLOT_COUNT = (CAL_END - CAL_START) / 30

const TIME_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const mins = CAL_START + i * 30
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return {
    mins,
    label: m === 0 ? `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}` : '',
  }
})

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

function fmtWeekRange(weekDates) {
  const mon = weekDates[1]
  const sat = weekDates[6]
  const monStr = mon.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  const satStr = mon.getMonth() === sat.getMonth()
    ? sat.getDate()
    : sat.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  return `${monStr} – ${satStr}`
}

const EVENT_STYLES = {
  student: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  coach:   { bg: 'bg-sky-50 border-sky-200',         text: 'text-sky-700'     },
  social:  { bg: 'bg-violet-50 border-violet-200',   text: 'text-violet-700'  },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [coachingSessions, setCoachingSessions] = useState([])
  const [coachSessions,    setCoachSessions]    = useState([])
  const [socialSessions,   setSocialSessions]   = useState([])
  const [checkedIn,        setCheckedIn]        = useState(new Set())
  const [hoursBalance,     setHoursBalance]     = useState(null)
  const [loadingData,      setLoadingData]      = useState(false)

  const todayDow = new Date().getDay() || 7
  const defaultDow = CHECKIN_DOWS.includes(todayDow) ? todayDow : 1
  const [selectedCheckInDay, setSelectedCheckInDay] = useState(defaultDow)
  const [activeTab, setActiveTab] = useState('checkin')

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
  const checkInDateISO   = useMemo(() => toISO(weeks[0][selectedCheckInDay]), [weeks, selectedCheckInDay])

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

  return (
    <div className="bg-white min-h-screen pt-24 pb-16 px-4 max-w-3xl mx-auto">

      {/* Greeting */}
      {user?.name && (
        <p className="text-xs tracking-[0.3em] uppercase text-gray-800 mb-6">
          Welcome back, {user.name.split(' ')[0]}
        </p>
      )}

      {/* Tab bar */}
      <div className="flex gap-8 mb-8 border-b border-gray-300">
        {[
          { id: 'checkin',  label: 'My Day' },
          { id: 'schedule', label: 'My Schedule' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-black text-black'
                : 'border-transparent text-gray-700 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: My Day ────────────────────────────────────────────────── */}
      {activeTab === 'checkin' && (
        <div className="space-y-6">

          {/* Coaching hours balance */}
          {hoursBalance !== null && (
            <div className="border border-gray-300 rounded-xl p-6">
              <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 mb-4">Coaching Hours</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center py-4 border border-gray-300 rounded-lg">
                  <p className="text-[10px] tracking-widest uppercase text-gray-800 mb-2">1-on-1</p>
                  <p className={`font-display text-4xl font-normal leading-none ${(hoursBalance.solo ?? 0) >= 0 ? 'text-black' : 'text-red-500'}`}>
                    {(hoursBalance.solo ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-700 mt-2">hrs remaining</p>
                </div>
                <div className="text-center py-4 border border-gray-300 rounded-lg">
                  <p className="text-[10px] tracking-widest uppercase text-gray-800 mb-2">Group</p>
                  <p className={`font-display text-4xl font-normal leading-none ${(hoursBalance.group ?? 0) >= 0 ? 'text-black' : 'text-red-500'}`}>
                    {(hoursBalance.group ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-700 mt-2">hrs remaining</p>
                </div>
              </div>
            </div>
          )}

          {/* Check-In */}
          <div className="border border-gray-300 rounded-xl p-6">
            <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 mb-4">Check-In</p>
            <div className="flex gap-2 mb-5">
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
                    className={`relative flex-1 py-2 text-xs border transition-colors flex flex-col items-center gap-0.5 ${
                      selectedCheckInDay === dow
                        ? 'bg-black border-black text-white'
                        : 'border-gray-400 text-gray-700 hover:border-black hover:text-black'
                    }`}
                  >
                    <span className="uppercase tracking-wide">{dayLabel}</span>
                    <span className="text-xs opacity-70">{dateNum}</span>
                    {isToday && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-black" />}
                  </button>
                )
              })}
            </div>
            {dayActivities.length === 0 ? (
              <p className="text-sm text-gray-700">No sessions scheduled.</p>
            ) : (
              <div className="divide-y divide-gray-300">
                {dayActivities.map(act => {
                  const key     = `${act.type}:${act.refId}`
                  const done    = checkedIn.has(key)
                  return (
                    <div key={key} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-black">{act.title}</p>
                          <p className="text-sm text-gray-800">{act.subtitle}</p>
                          <p className="text-xs text-gray-700 mt-0.5">{act.time}</p>
                        </div>
                        {done
                          ? <span className="text-xs text-black flex-shrink-0">✓ Checked In</span>
                          : <span className="text-xs text-gray-700 flex-shrink-0">Upcoming</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="border border-gray-300 rounded-xl overflow-hidden">
            {[['Profile Settings', '/profile'], ['Social Play', '/play']].map(([label, to]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between px-6 py-4 text-sm text-gray-700 hover:text-black border-b border-gray-300 last:border-0 transition-colors"
              >
                {label}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>

        </div>
      )}

      {/* ── Tab 2: My Schedule ───────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div>

          {/* Week selector */}
          <div className="flex gap-2 flex-wrap mb-5">
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
                  className={`relative px-4 py-1.5 text-xs border transition-colors ${
                    selectedWeek === i
                      ? 'bg-black border-black text-white'
                      : 'border-gray-400 text-gray-700 hover:border-black hover:text-black'
                  }`}
                >
                  {fmtWeekRange(weekDates)}
                  {hasEvents && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-black" />}
                </button>
              )
            })}
          </div>

          {/* Calendar */}
          <div className="border border-gray-300 rounded-xl overflow-hidden">
            <div className="grid border-b border-gray-300" style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}>
              <div />
              {CAL_DAYS.map(({ short, dow }) => {
                const date    = currentWeekDates[dow]
                const dateISO = toISO(date)
                const isToday = dateISO === todayISO
                return (
                  <div key={dow} className={`py-2.5 text-center border-l border-gray-300 ${isToday ? 'bg-gray-50' : ''}`}>
                    <p className={`text-[10px] uppercase tracking-widest ${isToday ? 'text-black' : 'text-gray-700'}`}>{short}</p>
                    <p className={`text-base font-normal leading-tight ${isToday ? 'text-black' : 'text-gray-700'}`}>{date.getDate()}</p>
                    <p className="text-[10px] text-gray-700">{date.toLocaleDateString('en-AU', { month: 'short' })}</p>
                  </div>
                )
              })}
            </div>
            <div className="grid" style={{ gridTemplateColumns: '52px repeat(4, 1fr)' }}>
              <div className="border-r border-gray-300">
                {TIME_SLOTS.map(({ mins, label }) => (
                  <div key={mins} style={{ height: ROW_H }} className="flex items-start justify-end pr-1.5 pt-0.5">
                    {label && <span className="text-[10px] text-gray-700 leading-none whitespace-nowrap">{label}</span>}
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
                  <div key={dow} className={`relative border-l border-gray-300 overflow-hidden ${isToday ? 'bg-gray-50/50' : ''}`} style={{ height: totalH }}>
                    {TIME_SLOTS.map(({ mins }) => (
                      <div key={mins} className="absolute left-0 right-0 border-b border-gray-50" style={{ top: (mins - CAL_START) / 30 * ROW_H, height: ROW_H }} />
                    ))}
                    {loadingData && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-gray-300 animate-pulse">loading</span>
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
                        <div key={id} className={`absolute left-0.5 right-0.5 border ${bg} ${text} text-xs leading-tight overflow-hidden`} style={{ top: top + 1, height }} title={`${title} · ${fmtTime(data.start_time)}–${fmtTime(data.end_time)}`}>
                          <div className="p-1 h-full flex flex-col justify-between">
                            <p className="font-normal truncate">{title}</p>
                            {height > 38 && <p className="opacity-60 truncate">{fmtTime(data.start_time)}</p>}
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
          <div className="flex gap-6 mt-3">
            {[
              { label: 'Coaching Session', color: 'bg-emerald-200' },
              { label: 'Teaching Session', color: 'bg-sky-200' },
              { label: 'Social Play',      color: 'bg-violet-200' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 ${color}`} />
                <span className="text-xs text-gray-800">{label}</span>
              </div>
            ))}
          </div>

        </div>
      )}

    </div>
  )
}
