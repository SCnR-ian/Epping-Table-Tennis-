import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useAuth } from '@/context/AuthContext'
import { coachingAPI, socialAPI, checkinAPI, bookingsAPI, paymentsAPI, venueAPI } from '@/api/api'
import QrScanModal from '@/components/QrScanModal'

// ── Stripe extension payment form ─────────────────────────────────────────────
function ExtensionPaymentForm({ groupId, extraMins, intentId, amountCents, onSuccess, onError }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handlePay(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true); setError(null)
    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin },
      redirect: 'if_required',
    })
    if (stripeErr) { setError(stripeErr.message); setLoading(false); return }
    // Manual-capture PI → status is 'requires_capture' after card auth
    if (paymentIntent?.status === 'requires_capture' || paymentIntent?.status === 'succeeded') {
      try {
        await bookingsAPI.extendGroup(groupId, extraMins, intentId)
        onSuccess()
      } catch (err) {
        setError(err.response?.data?.message ?? 'Extension failed. Please contact us.')
        setLoading(false)
      }
    } else {
      setError('Payment incomplete. Please try again.')
      setLoading(false)
    }
  }

  const aud = (amountCents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })
  return (
    <form onSubmit={handlePay} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-black text-white text-sm py-3 rounded-full hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Processing…' : `Pay AUD $${aud}`}
      </button>
    </form>
  )
}

const REVIEW_SKILLS = [
  { key: 'forehand',         label: 'Forehand' },
  { key: 'backhand',         label: 'Backhand' },
  { key: 'looping',          label: 'Looping' },
  { key: 'forehand_push',    label: 'Forehand Pushing' },
  { key: 'backhand_push',    label: 'Backhand Pushing' },
  { key: 'one_bh_on_fh',     label: 'One Backhand on Forehand' },
  { key: 'two_bh_two_fh',    label: 'Two Backhand Two Forehand' },
  { key: 'serve_and_attack', label: 'Serve and Attack' },
]
const SKILL_LABEL = Object.fromEntries(REVIEW_SKILLS.map(s => [s.key, s.label]))

function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDuration(inAt, outAt) {
  if (!inAt || !outAt) return null
  const ms = new Date(outAt) - new Date(inAt)
  const totalMins = Math.round(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
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
  booking: { bg: 'bg-orange-50 border-orange-200',   text: 'text-orange-700'  },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [coachingSessions, setCoachingSessions] = useState([])
  const [coachSessions,    setCoachSessions]    = useState([])
  const [socialSessions,   setSocialSessions]   = useState([])
  const [allMySocial,      setAllMySocial]      = useState([])
  const [tableBookings,    setTableBookings]    = useState([])
  const [checkedIn,        setCheckedIn]        = useState(new Set())
  const [selectedEvent,    setSelectedEvent]    = useState(null) // { type, data }
  const [cancelling,       setCancelling]       = useState(false)
  const [hoursBalance,     setHoursBalance]     = useState(null)
  const [loadingData,      setLoadingData]      = useState(false)
  const [myReviews,       setMyReviews]       = useState([])
  const [reviewModal,     setReviewModal]     = useState(null) // { sessionId, studentName, date, existingReview }
  const [reviewSkills,    setReviewSkills]    = useState([])
  const [reviewBody,      setReviewBody]      = useState('')
  const [savingReview,    setSavingReview]    = useState(false)
  const [pastReviewsOpen, setPastReviewsOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null) // student_id for by-student view
  const [myAttendance,      setMyAttendance]      = useState([])
  const [attendanceOpen,    setAttendanceOpen]    = useState(false)
  const [showAllAttendance, setShowAllAttendance] = useState(false)
  const [expandedReview,    setExpandedReview]    = useState(null) // session id
  const [showAllUpcoming,   setShowAllUpcoming]   = useState(false)
  const [ratingModal,       setRatingModal]       = useState(null)  // { sessionId, coachName, date, existingRating, existingComment }
  const [ratingValue,       setRatingValue]       = useState(0)
  const [ratingHover,       setRatingHover]       = useState(0)
  const [ratingComment,     setRatingComment]     = useState('')
  const [savingRating,      setSavingRating]      = useState(false)

  const [venueHistory,      setVenueHistory]      = useState([])
  const [venueHistoryOpen,  setVenueHistoryOpen]  = useState(false)
  const [pastSocialOpen,    setPastSocialOpen]    = useState(false)

  // Extension payment flow
  const [extStep,         setExtStep]         = useState(null) // null|'select'|'pay'
  const [extMins,         setExtMins]         = useState(null)
  const [extClientSecret, setExtClientSecret] = useState(null)
  const [extIntentId,     setExtIntentId]     = useState(null)
  const [extAmount,       setExtAmount]       = useState(null)
  const [extLoading,      setExtLoading]      = useState(false)
  const [extError,        setExtError]        = useState(null)
  const [stripePromise,   setStripePromise]   = useState(null)

  const todayDow = new Date().getDay() || 7
  const defaultDow = CHECKIN_DOWS.includes(todayDow) ? todayDow : 1
  const [selectedCheckInDay, setSelectedCheckInDay] = useState(defaultDow)
  const [activeTab, setActiveTab] = useState('checkin')
  const [scanOpen, setScanOpen] = useState(false)

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
      coachingAPI.getMyReviews(),
      coachingAPI.getMyHistory(),
      bookingsAPI.getMyBookings(),
      venueAPI.getHistory(),
      socialAPI.getMySessions(),
    ])
      .then(([coachingRes, coachRes, socialRes, checkinRes, hoursRes, myReviewsRes, myHistoryRes, bookingsRes, venueHistoryRes, mySocialRes]) => {
        if (cancelled) return
        if (coachingRes.status === 'fulfilled')
          setCoachingSessions(coachingRes.value.data.sessions)
        if (coachRes.status === 'fulfilled')
          setCoachSessions(coachRes.value.data.sessions)
        if (socialRes.status === 'fulfilled')
          setSocialSessions(socialRes.value.data.sessions.filter(s => s.joined))
        if (mySocialRes?.status === 'fulfilled')
          setAllMySocial(mySocialRes.value.data.sessions ?? [])
        if (bookingsRes.status === 'fulfilled')
          setTableBookings(bookingsRes.value.data.bookings.filter(b => b.status !== 'cancelled'))
        if (checkinRes.status === 'fulfilled')
          setCheckedIn(new Set(
            checkinRes.value.data.checkIns.map(ci => `${ci.type}:${ci.reference_id}`)
          ))
        if (hoursRes?.status === 'fulfilled' && hoursRes.value)
          setHoursBalance(hoursRes.value.data.balance ?? 0)
        if (myReviewsRes.status === 'fulfilled')
          setMyReviews(myReviewsRes.value.data.reviews ?? [])
        if (myHistoryRes?.status === 'fulfilled')
          setMyAttendance(myHistoryRes.value.data.sessions ?? [])
        if (venueHistoryRes?.status === 'fulfilled')
          setVenueHistory(venueHistoryRes.value.data.history ?? [])
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
      ...tableBookings.map(b => b.date?.slice(0, 10)),
    ].filter(d => d && d >= today).sort()
    if (!dates.length) return
    const nearest = dates[0]
    const idx = weeks.findIndex(week => Object.values(week).some(d => toISO(d) === nearest))
    if (idx >= 0) {
      setSelectedWeek(idx)
      autoJumped.current = true
    }
  }, [coachingSessions, coachSessions, socialSessions, tableBookings, weeks])

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
    tableBookings
      .filter(b => b.date?.slice(0, 10) === dateISO)
      .forEach(b => events.push({ id: `tb-${b.booking_group_id}`, type: 'booking', data: b }))
    return events
  }

  async function handleCancelBooking(groupId) {
    setCancelling(true)
    try {
      await bookingsAPI.cancelGroup(groupId)
      setTableBookings(prev => prev.filter(b => b.booking_group_id !== groupId))
      setSelectedEvent(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel booking.')
    } finally { setCancelling(false) }
  }

  async function handleLeaveSession(sessionId) {
    setCancelling(true)
    try {
      await socialAPI.leave(sessionId)
      setSocialSessions(prev => prev.filter(s => s.id !== sessionId))
      setSelectedEvent(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel spot.')
    } finally { setCancelling(false) }
  }

  function resetExt() {
    setExtStep(null); setExtMins(null); setExtClientSecret(null)
    setExtIntentId(null); setExtAmount(null); setExtLoading(false); setExtError(null)
  }

  async function handleSelectExtDuration(groupId, mins) {
    setExtMins(mins); setExtLoading(true); setExtError(null)
    try {
      // Lazy-load Stripe only when needed
      if (!stripePromise) {
        const configRes = await paymentsAPI.getConfig()
        setStripePromise(loadStripe(configRes.data.publishableKey))
      }
      const res = await paymentsAPI.authorizeExtension({ groupId, extra_minutes: mins })
      setExtClientSecret(res.data.clientSecret)
      setExtIntentId(res.data.intentId)
      setExtAmount(res.data.amount)
      setExtStep('pay')
    } catch (err) {
      setExtError(err.response?.data?.message ?? 'Could not start extension. Please try again.')
    } finally { setExtLoading(false) }
  }

  return (
    <>
    <div className="bg-white min-h-screen pt-6 pb-16 px-4 max-w-3xl mx-auto">

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

          {/* Scan QR button */}
          <button
            onClick={() => setScanOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 bg-black text-white text-sm font-medium py-4 rounded-xl hover:bg-gray-800 active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 17.25h.75v.75h-.75v-.75zM17.25 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75H13.5V13.5zM13.5 19.5h.75v.75H13.5V19.5zM19.5 13.5h.75v.75h-.75V13.5zM19.5 19.5h.75v.75h-.75V19.5zM16.5 16.5h.75v.75h-.75V16.5z" />
            </svg>
            Scan QR to Check In / Out
          </button>

          {/* Coaching balance */}
          {hoursBalance !== null && (
            <div className="border border-gray-300 rounded-xl p-6">
              <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 mb-4">Coaching Balance</p>
              <div className="text-center py-4">
                <p className={`font-display text-5xl font-normal leading-none ${hoursBalance >= 0 ? 'text-black' : 'text-red-500'}`}>
                  ${hoursBalance.toFixed(2)}
                </p>
                <p className="text-xs text-gray-700 mt-2">remaining</p>
              </div>
            </div>
          )}

          {/* Today */}
          {(() => {
            const todayEvents = [
              ...coachingSessions.filter(s => s.date?.slice(0,10) === todayISO)
                .map(s => ({ key: `cs-${s.id}`, type: 'coaching', label: `w/ ${s.coach_name}`, start: s.start_time, end: s.end_time, dot: 'bg-emerald-400' })),
              ...socialSessions.filter(s => s.date?.slice(0,10) === todayISO)
                .map(s => ({ key: `sp-${s.id}`, type: 'social', label: s.title || 'Social Play', start: s.start_time, end: s.end_time, dot: 'bg-violet-400', data: s })),
              ...tableBookings.filter(b => b.date?.slice(0,10) === todayISO)
                .map(b => ({ key: `tb-${b.booking_group_id}`, type: 'booking', label: 'Table Booking', start: b.start_time, end: b.end_time, dot: 'bg-orange-400', data: b })),
            ].sort((a, b) => a.start.localeCompare(b.start))

            if (!todayEvents.length) return null
            return (
              <div className="border border-gray-300 rounded-xl overflow-hidden">
                <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 px-5 pt-5 pb-3">Today</p>
                <div className="divide-y divide-gray-100">
                  {todayEvents.map(ev => {
                    const clickable = ev.type === 'booking' || ev.type === 'social'
                    return (
                      <div
                        key={ev.key}
                        onClick={() => clickable && setSelectedEvent({ type: ev.type, data: ev.data })}
                        className={`flex items-center gap-3 px-5 py-3.5 ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{ev.label}</p>
                          {ev.type === 'booking' && (
                            <p className="text-[11px] text-orange-500 mt-0.5">Card hold released on check-in</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">{fmtTime(ev.start)}</p>
                          <p className="text-[11px] text-gray-400">{fmtTime(ev.end)}</p>
                        </div>
                        {clickable && (
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Upcoming */}
          {(() => {
            const allUpcoming = [
              ...coachingSessions.filter(s => s.date?.slice(0,10) > todayISO)
                .map(s => ({ key: `cs-${s.id}`, type: 'coaching', label: `w/ ${s.coach_name}`, date: s.date, start: s.start_time, end: s.end_time, dot: 'bg-emerald-400' })),
              ...socialSessions.filter(s => s.date?.slice(0,10) > todayISO)
                .map(s => ({ key: `sp-${s.id}`, type: 'social', label: s.title || 'Social Play', date: s.date, start: s.start_time, end: s.end_time, dot: 'bg-violet-400', data: s })),
              ...tableBookings.filter(b => b.date?.slice(0,10) > todayISO)
                .map(b => ({ key: `tb-${b.booking_group_id}`, type: 'booking', label: 'Table Booking', date: b.date, start: b.start_time, end: b.end_time, dot: 'bg-orange-400', data: b })),
            ].sort((a, b) => a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date))

            if (!allUpcoming.length) return null
            return (
              <div className="border border-gray-300 rounded-xl overflow-hidden">
                <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 px-5 pt-5 pb-3">Upcoming</p>
                <div className="divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 3 * 64 }}>
                  {allUpcoming.map(ev => {
                    const dateStr = new Date(ev.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{ weekday:'short', day:'numeric', month:'short' })
                    const clickable = ev.type === 'booking' || ev.type === 'social'
                    return (
                      <div
                        key={ev.key}
                        onClick={() => clickable && setSelectedEvent({ type: ev.type, data: ev.data })}
                        className={`flex items-center gap-3 px-5 py-3.5 ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{dateStr} · {ev.label}</p>
                          <p className="text-xs text-gray-400">{fmtTime(ev.start)} – {fmtTime(ev.end)}</p>
                        </div>
                        {clickable && (
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Past Sessions (social play + table bookings combined) */}
          {(() => {
            const pastSocial   = allMySocial.filter(s => s.date?.slice(0,10) < todayISO)
              .map(s => ({ key: `sp-${s.id}`, date: s.date, type: 'social', label: s.title || 'Social Play', start: s.start_time, end: s.end_time }))
            const pastBookings = tableBookings.filter(b => b.date?.slice(0,10) < todayISO)
              .map(b => ({ key: `tb-${b.booking_group_id}`, date: b.date, type: 'booking', label: 'Table Booking', start: b.start_time, end: b.end_time }))
            const past = [...pastSocial, ...pastBookings]
              .sort((a, b) => b.date === a.date ? b.start.localeCompare(a.start) : b.date.localeCompare(a.date))
            if (!past.length) return null
            return (
              <div className="border border-gray-300 rounded-xl p-6">
                <button onClick={() => setPastSocialOpen(o => !o)} className="flex items-center justify-between w-full">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800">Past Sessions</p>
                  <span className="text-xs text-gray-400">{pastSocialOpen ? '▲' : '▼'}</span>
                </button>
                {pastSocialOpen && (
                  <div className="divide-y divide-gray-200 mt-4 overflow-y-auto" style={{ maxHeight: 5 * 58 }}>
                    {past.map(ev => {
                      const dateStr = new Date(ev.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
                      const dot = ev.type === 'social' ? 'bg-violet-400' : 'bg-orange-400'
                      return (
                        <div key={ev.key} className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">{ev.label}</p>
                            <p className="text-xs text-gray-500">{dateStr} · {fmtTime(ev.start)}–{fmtTime(ev.end)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Attendance History (student view) */}
          {myAttendance.length > 0 && (
            <div className="border border-gray-300 rounded-xl p-6">
              <button onClick={() => setAttendanceOpen(o => !o)} className="flex items-center justify-between w-full">
                <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800">Past Coaching Sessions</p>
                <span className="text-xs text-gray-400">{attendanceOpen ? '▲' : '▼'}</span>
              </button>
              {attendanceOpen && (
                <>
                  <div className="divide-y divide-gray-200 mt-4 overflow-y-auto" style={{ maxHeight: 5 * 62 }}>
                    {myAttendance.map(s => {
                      const dateStr  = s.date ? new Date(s.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : ''
                      const timeStr  = `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`
                      const attended = s.checked_in && !s.no_show
                      const noShow   = s.no_show
                      const hasReview = s.review_body || (s.review_skills?.length > 0)
                      const isOpen   = expandedReview === s.id
                      return (
                        <div key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">{dateStr} · {s.coach_name}</p>
                              <p className="text-xs text-gray-500">{timeStr}</p>
                              {/* Student's own star rating display */}
                              {s.student_rating && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {[1,2,3,4,5].map(n => (
                                    <span key={n} className={`text-xs ${n <= s.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                              {s.charged != null && (
                                <span className="text-xs text-gray-400">−${Number(s.charged).toFixed(0)}</span>
                              )}
                              {attended
                                ? <span className="text-xs font-medium text-emerald-600">✓ Attended</span>
                                : noShow
                                  ? <span className="text-xs font-medium text-red-500">✗ No Show</span>
                                  : <span className="text-xs text-gray-400">—</span>
                              }
                              {hasReview && (
                                <button
                                  onClick={() => setExpandedReview(isOpen ? null : s.id)}
                                  className="text-xs text-sky-600 hover:text-sky-500"
                                >
                                  {isOpen ? 'Hide' : 'Review'}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setRatingValue(s.student_rating ?? 0)
                                  setRatingComment(s.student_comment ?? '')
                                  setRatingModal({ sessionId: s.id, coachName: s.coach_name, date: dateStr, existingRating: s.student_rating })
                                }}
                                className="text-xs text-amber-600 hover:text-amber-500"
                              >
                                {s.student_rating ? '✎ Rating' : '☆ Rate'}
                              </button>
                            </div>
                          </div>
                          {isOpen && hasReview && (
                            <div className="mt-2 pl-3 border-l-2 border-gray-200">
                              {s.review_skills?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                  {s.review_skills.map(k => (
                                    <span key={k} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                                      {SKILL_LABEL[k] ?? k}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {s.review_body && (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.review_body}</p>
                              )}
                              {s.student_comment && (
                                <p className="text-xs text-gray-500 italic mt-1 whitespace-pre-wrap">Your comment: {s.student_comment}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Venue Check-in History */}
          {venueHistory.length > 0 && (
            <div className="border border-gray-300 rounded-xl p-6">
              <button onClick={() => setVenueHistoryOpen(o => !o)} className="flex items-center justify-between w-full">
                <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800">Venue Attendance</p>
                <span className="text-xs text-gray-400">{venueHistoryOpen ? '▲' : '▼'}</span>
              </button>
              {venueHistoryOpen && (
                <div className="divide-y divide-gray-200 mt-4 overflow-y-auto" style={{ maxHeight: 5 * 52 }}>
                  {venueHistory.map((row, i) => {
                    const dateStr = new Date(row.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                    const inTime  = row.checked_in_at
                      ? new Date(row.checked_in_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true })
                      : null
                    const outTime = row.checked_out_at
                      ? new Date(row.checked_out_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true })
                      : null
                    const duration = fmtDuration(row.checked_in_at, row.checked_out_at)
                    const autoOut  = row.checked_out_at && new Date(row.checked_out_at).toTimeString().startsWith('23:5')
                    return (
                      <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900">{dateStr}</p>
                          {inTime && (
                            <p className="text-xs text-gray-500">
                              {inTime}{outTime ? ` – ${outTime}` : ' (no check-out)'}
                            </p>
                          )}
                          {autoOut && (
                            <p className="text-[11px] text-gray-400">Auto check-out at midnight</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {duration
                            ? <span className="text-xs text-gray-500">{duration}</span>
                            : outTime == null && <span className="text-xs text-emerald-600 font-medium">In venue</span>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Session Reviews — coach view */}
          {coachSessions.length > 0 && (() => {
            const todayISO_ = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
            const todaySessions = coachSessions.filter(s => s.date?.slice(0,10) === todayISO_)
            const pastSessions  = coachSessions.filter(s => s.date?.slice(0,10) < todayISO_)

            const openReviewModal = async (s) => {
              let existingReview = null
              if (s.has_review) {
                try { const r = await coachingAPI.getSessionReview(s.id); existingReview = r.data.review } catch {}
              }
              setReviewSkills(existingReview?.skills ?? [])
              setReviewBody(existingReview?.body ?? '')
              setReviewModal({
                sessionId: s.id,
                studentName: s.student_name,
                date: new Date(s.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
                existingReview,
              })
            }

            // Group past sessions by student
            const studentMap = {}
            for (const s of pastSessions) {
              const key = s.student_id
              if (!studentMap[key]) studentMap[key] = { name: s.student_name, id: key, sessions: [] }
              studentMap[key].sessions.push(s)
            }
            const students = Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name))

            return (
              <>
                {/* Today's sessions */}
                <div className="border border-gray-300 rounded-xl p-6">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800 mb-4">Today's Sessions</p>
                  {todaySessions.length === 0 ? (
                    <p className="text-sm text-gray-500">No sessions today.</p>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {todaySessions.map(s => (
                        <div key={s.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{s.student_name}</p>
                            <p className="text-xs text-gray-500">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</p>
                            {s.student_rating && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                {[1,2,3,4,5].map(n => <span key={n} className={`text-xs ${n <= s.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>)}
                              </div>
                            )}
                          </div>
                          <button onClick={() => openReviewModal(s)} className="flex-shrink-0 text-xs text-sky-600 hover:text-sky-500 whitespace-nowrap">
                            {s.has_review ? '✎ Edit' : 'Write Feedback'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Student */}
                {students.length > 0 && (
                  <div className="border border-gray-300 rounded-xl overflow-hidden">
                    <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                      <p className="text-[10px] tracking-[0.3em] uppercase text-gray-800">Feedback by Student</p>
                      {selectedStudent && (
                        <button onClick={() => setSelectedStudent(null)} className="text-xs text-gray-400 hover:text-black transition-colors">
                          ← All Students
                        </button>
                      )}
                    </div>

                    {/* Student list */}
                    {!selectedStudent && (
                      <div className="divide-y divide-gray-200 overflow-y-auto" style={{ maxHeight: 5 * 65 }}>
                        {students.map(st => {
                          const unreviewed = st.sessions.filter(s => !s.has_review).length
                          return (
                            <button
                              key={st.id}
                              onClick={() => setSelectedStudent(st.id)}
                              className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors text-left"
                            >
                              <div>
                                <p className="text-sm text-gray-900">{st.name}</p>
                                <p className="text-xs text-gray-400">{st.sessions.length} session{st.sessions.length !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {unreviewed > 0 && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                    {unreviewed} pending
                                  </span>
                                )}
                                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Sessions for selected student */}
                    {selectedStudent && (() => {
                      const st = studentMap[selectedStudent]
                      if (!st) return null
                      return (
                        <div className="divide-y divide-gray-200">
                          {st.sessions.map(s => {
                            const isPast = s.date?.slice(0,10) < todayISO_
                            const dateStr = new Date(s.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                            return (
                              <div key={s.id} className={`px-6 py-3.5 flex items-center justify-between gap-3 ${!s.has_review && isPast ? 'bg-amber-50' : ''}`}>
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900">{dateStr}</p>
                                  <p className="text-xs text-gray-500">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</p>
                                  {s.student_rating && (
                                    <div className="flex items-center gap-0.5 mt-0.5">
                                      {[1,2,3,4,5].map(n => <span key={n} className={`text-xs ${n <= s.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>)}
                                    </div>
                                  )}
                                  {s.has_review && <p className="text-xs text-green-600 mt-0.5">✓ Feedback written</p>}
                                  {!s.has_review && isPast && <p className="text-xs text-amber-600 mt-0.5">No feedback yet</p>}
                                </div>
                                {isPast && (
                                  <button onClick={() => openReviewModal(s)} className="flex-shrink-0 text-xs text-sky-600 hover:text-sky-500 whitespace-nowrap">
                                    {s.has_review ? '✎ Edit' : 'Write Feedback'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    <div className="pb-2" />
                  </div>
                )}
              </>
            )
          })()}

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
                  || tableBookings.some(b => b.date?.slice(0, 10) === iso)
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
          <div className="border border-gray-300 rounded-xl overflow-x-auto">
          <div style={{ minWidth: 492 }}>
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
                      const title = type === 'student' ? `w/ ${data.coach_name}` : type === 'coach' ? `→ ${data.student_name}` : type === 'booking' ? 'Table Booking' : data.title || 'Social Play'
                      const clickable = type === 'booking' || type === 'social'
                      return (
                        <div
                          key={id}
                          onClick={() => clickable && setSelectedEvent({ type, data })}
                          className={`absolute left-0.5 right-0.5 border ${bg} ${text} text-xs leading-tight overflow-hidden ${clickable ? 'cursor-pointer hover:brightness-95' : ''}`}
                          style={{ top: top + 1, height }}
                          title={`${title} · ${fmtTime(data.start_time)}–${fmtTime(data.end_time)}`}
                        >
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
          </div>

          {/* Legend */}
          <div className="flex gap-4 flex-wrap mt-3">
            {[
              { label: 'Coaching Session', color: 'bg-emerald-200' },
              { label: 'Teaching Session', color: 'bg-sky-200' },
              { label: 'Social Play',      color: 'bg-violet-200' },
              { label: 'Table Booking',    color: 'bg-orange-200' },
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

    {/* ── Event Detail Popup ──────────────────────────────────────────────── */}
    {selectedEvent && (() => {
      const { type, data } = selectedEvent
      const isPast = data.date?.slice(0, 10) < todayISO
      const dateStr = data.date ? new Date(data.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{ weekday:'long', day:'numeric', month:'long' }) : ''
      const timeStr = `${fmtTime(data.start_time)} – ${fmtTime(data.end_time)}`

      return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setSelectedEvent(null); resetExt() } }}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-black font-normal">
                  {type === 'booking' ? 'Table Booking' : data.title || 'Social Play'}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">{dateStr}</p>
              </div>
              <button onClick={() => { setSelectedEvent(null); resetExt() }} className="text-gray-400 hover:text-black text-xl leading-none">×</button>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden text-sm">
              {[
                ['Time',   timeStr],
                ...(type === 'booking' ? [['Status', data.status === 'confirmed' ? 'Confirmed' : data.status]] : []),
                ...(type === 'social'  ? [['Spots',  data.participant_count != null ? `${data.participant_count} joined` : '']] : []),
              ].filter(([,v]) => v).map(([label, val]) => (
                <div key={label} className="flex justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
                  <span className="text-xs tracking-widest uppercase text-gray-400">{label}</span>
                  <span className="text-black">{val}</span>
                </div>
              ))}
            </div>

            {/* Extension flow (booking only, not past) */}
            {!isPast && type === 'booking' && extStep === 'select' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 text-center">Select extra time ($5 / 30 min)</p>
                <div className="grid grid-cols-2 gap-2">
                  {[30, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      onClick={() => handleSelectExtDuration(data.booking_group_id, mins)}
                      disabled={extLoading}
                      className="border border-gray-200 rounded-xl py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      +{mins} min
                    </button>
                  ))}
                </div>
                {extLoading && <p className="text-center text-xs text-gray-400">Preparing payment…</p>}
                {extError  && <p className="text-center text-xs text-red-500">{extError}</p>}
                <button onClick={resetExt} className="w-full text-xs text-gray-400 hover:text-gray-600">← Back</button>
              </div>
            )}

            {!isPast && type === 'booking' && extStep === 'pay' && extClientSecret && stripePromise && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 text-center">
                  Extend +{extMins} min · AUD ${(extAmount / 100).toFixed(2)}
                </p>
                <Elements stripe={stripePromise} options={{ clientSecret: extClientSecret, appearance: { theme: 'stripe' } }}>
                  <ExtensionPaymentForm
                    groupId={data.booking_group_id}
                    extraMins={extMins}
                    intentId={extIntentId}
                    amountCents={extAmount}
                    onSuccess={() => {
                      resetExt()
                      setSelectedEvent(null)
                      bookingsAPI.getMyBookings().then(r => setTableBookings(r.data.bookings.filter(b => b.status !== 'cancelled'))).catch(() => {})
                    }}
                    onError={(msg) => setExtError(msg)}
                  />
                </Elements>
                <button onClick={() => setExtStep('select')} className="w-full text-xs text-gray-400 hover:text-gray-600">← Back</button>
              </div>
            )}

            {!isPast && extStep == null && (
              type === 'booking' ? (
                <div className="space-y-2">
                  <button
                    onClick={() => { resetExt(); setExtStep('select') }}
                    className="w-full border border-gray-200 text-gray-700 text-xs tracking-widest uppercase py-3 rounded-full hover:bg-gray-50 transition-colors"
                  >
                    Extend Booking
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm('Cancel this booking? Your card hold will be released.')) return
                      handleCancelBooking(data.booking_group_id)
                    }}
                    disabled={cancelling}
                    className="w-full border border-red-200 text-red-600 text-xs tracking-widest uppercase py-3 rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel Booking'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!window.confirm('Cancel your spot? Cancellations must be made at least 24 hours before the session.')) return
                    handleLeaveSession(data.id)
                  }}
                  disabled={cancelling}
                  className="w-full border border-red-200 text-red-600 text-xs tracking-widest uppercase py-3 rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? 'Cancelling…' : 'Cancel Spot'}
                </button>
              )
            )}

            {isPast && (
              <p className="text-center text-xs text-gray-400">This session has already passed.</p>
            )}
          </div>
        </div>
      )
    })()}

    {/* ── Student Rating Modal ─────────────────────────────────────────────── */}
    {ratingModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setRatingModal(null) }}>
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-gray-900">Rate your session</p>
              <p className="text-xs text-gray-500">{ratingModal.date} · {ratingModal.coachName}</p>
            </div>
            <button onClick={() => setRatingModal(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
          </div>
          {/* Star picker */}
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setRatingHover(n)}
                onMouseLeave={() => setRatingHover(0)}
                onClick={() => setRatingValue(n)}
                className={`text-4xl transition-colors ${n <= (ratingHover || ratingValue) ? 'text-amber-400' : 'text-gray-200'}`}
              >★</button>
            ))}
          </div>
          {ratingValue > 0 && (
            <p className="text-center text-xs text-gray-500">
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][ratingValue]}
            </p>
          )}
          {/* Optional comment */}
          <textarea
            rows={3}
            value={ratingComment}
            onChange={e => setRatingComment(e.target.value)}
            placeholder="Optional comment…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:border-gray-500"
          />
          <button
            disabled={savingRating || ratingValue === 0}
            onClick={async () => {
              setSavingRating(true)
              try {
                await coachingAPI.submitStudentRating({ session_id: ratingModal.sessionId, rating: ratingValue, comment: ratingComment.trim() })
                setMyAttendance(prev => prev.map(s => s.id === ratingModal.sessionId
                  ? { ...s, student_rating: ratingValue, student_comment: ratingComment.trim() || null }
                  : s
                ))
                setRatingModal(null)
              } catch {}
              setSavingRating(false)
            }}
            className="w-full py-2.5 bg-black text-white text-sm rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            {savingRating ? 'Saving…' : ratingModal.existingRating ? 'Update Rating' : 'Submit Rating'}
          </button>
        </div>
      </div>
    )}

    {/* ── Review Modal ─────────────────────────────────────────────────────── */}
    {reviewModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setReviewModal(null) }}>
        <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-gray-900">{reviewModal.studentName}</p>
              <p className="text-xs text-gray-500">{reviewModal.date}</p>
            </div>
            <button onClick={() => setReviewModal(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
          </div>
          {/* Student rating (read-only, shown to coach) */}
          {reviewModal.existingReview?.student_rating && (
            <div className="bg-amber-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-1">Student rating</p>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(n => (
                  <span key={n} className={`text-lg ${n <= reviewModal.existingReview.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                ))}
              </div>
              {reviewModal.existingReview.student_comment && (
                <p className="text-sm text-gray-700 mt-1 italic">"{reviewModal.existingReview.student_comment}"</p>
              )}
            </div>
          )}

          {/* Skill checkboxes */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Skills covered</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {REVIEW_SKILLS.map(skill => (
                <label key={skill.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewSkills.includes(skill.key)}
                    onChange={() => setReviewSkills(prev =>
                      prev.includes(skill.key) ? prev.filter(k => k !== skill.key) : [...prev, skill.key]
                    )}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-gray-800">{skill.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Free text */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Additional notes</p>
            <textarea
              rows={4}
              value={reviewBody}
              onChange={e => setReviewBody(e.target.value)}
              placeholder="Write any additional notes here..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:border-gray-500"
            />
          </div>

          {/* Submit */}
          <button
            disabled={savingReview || (!reviewSkills.length && !reviewBody.trim())}
            onClick={async () => {
              setSavingReview(true)
              try {
                const payload = { session_id: reviewModal.sessionId, skills: reviewSkills, body: reviewBody.trim() }
                if (reviewModal.existingReview) {
                  await coachingAPI.updateReview(reviewModal.existingReview.id, { skills: reviewSkills, body: reviewBody.trim() })
                  setCoachSessions(prev => prev.map(s => s.id === reviewModal.sessionId ? { ...s, has_review: true } : s))
                } else {
                  await coachingAPI.submitReview(payload)
                  setCoachSessions(prev => prev.map(s => s.id === reviewModal.sessionId ? { ...s, has_review: true } : s))
                }
                setReviewModal(null)
              } catch {}
              setSavingReview(false)
            }}
            className="w-full py-2.5 bg-black text-white text-sm rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            {savingReview ? 'Saving…' : reviewModal.existingReview ? 'Update Review' : 'Submit Review'}
          </button>
          {!reviewSkills.length && !reviewBody.trim() && (
            <p className="text-xs text-center text-gray-400">Select at least one skill or add notes to submit</p>
          )}
        </div>
      </div>
    )}

      {scanOpen && <QrScanModal onClose={() => setScanOpen(false)} />}
    </>
  )
}
