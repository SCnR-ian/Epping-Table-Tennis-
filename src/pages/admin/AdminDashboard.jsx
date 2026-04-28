import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { adminAPI, bookingsAPI, coachingAPI, socialAPI, checkinAPI, analyticsAPI, homepageAPI, pagesAPI, clubAPI, venueAPI, articlesAPI, paymentsAPI } from '@/api/api'
import ShopManager from './ShopManager'
import QRCode from 'react-qr-code'
import { useClub } from '@/context/ClubContext'
import { EditModeContext } from '@/context/EditModeContext'
import EditableText from '@/components/cms/EditableText'
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
  const inSlot = ({ start_time, end_time }) => slotMins >= toMins(start_time) && slotMins < toMins(end_time)
  const bookingCourts  = bookings.filter(inSlot).length
  // Group sessions share one court — deduplicate by group_id
  const coachingCourts = new Set(
    sessions.filter(inSlot).map(s => s.group_id ?? String(s.id))
  ).size
  const socialCourts   = socialSessions.filter(inSlot).reduce((sum, s) => sum + (s.num_courts ?? 0), 0)
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


const TABS = ['Bookings', 'Members', 'Coaching', 'Social Play', 'Analytics', 'QR-Code', 'Shop', 'Articles']

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
const ALL_SLOTS = [...new Set([...SATURDAY_SLOTS, ...WEEKDAY_SLOTS])].sort()
// Returns the closing slot (last slot + 30 min) for a given slot array
const slotClosing = (slots) => { const m = toMins(slots[slots.length - 1]) + 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

const OPEN_DAYS = [
  { dow: 1, slots: WEEKDAY_SLOTS  },
  { dow: 2, slots: WEEKDAY_SLOTS  },
  { dow: 3, slots: WEEKDAY_SLOTS  },
  { dow: 6, slots: SATURDAY_SLOTS },
]

// Assigns each event a lane (column index).
// Coaching: one dedicated column per coach, sorted by session count desc (most → left).
// Social play: overlap-detected columns placed to the right of all coaching columns.
// Other (bookings): overlap-detected columns placed to the right of social.
function layoutEvents(events) {
  const coaching = events.filter(e => e.type === 'coaching' || e.type === 'coaching_group')
  const social   = events.filter(e => e.type === 'social')
  const other    = events.filter(e => e.type !== 'coaching' && e.type !== 'coaching_group' && e.type !== 'social')

  // Count sessions per coach and assign lanes (most sessions = lane 0)
  const coachCounts = {}
  coaching.forEach(e => { const k = e.coach_id ?? e.coach_name ?? 'x'; coachCounts[k] = (coachCounts[k] ?? 0) + 1 })
  const coachOrder = Object.entries(coachCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const coachLane  = Object.fromEntries(coachOrder.map((k, i) => [k, i]))
  const numCoachLanes = coachOrder.length

  const coachPlaced = coaching.map(ev => ({
    ...ev, lane: coachLane[ev.coach_id ?? ev.coach_name ?? 'x'] ?? 0,
  }))

  // Social: overlap detection starting at numCoachLanes
  const socialSorted = [...social].sort((a, b) => toMins(a.start_time) - toMins(b.start_time))
  const socialLaneEnd = []
  const socialPlaced = socialSorted.map(ev => {
    const s = toMins(ev.start_time)
    let lane = socialLaneEnd.findIndex(e => e <= s)
    if (lane === -1) { lane = socialLaneEnd.length; socialLaneEnd.push(0) }
    socialLaneEnd[lane] = toMins(ev.end_time)
    return { ...ev, lane: numCoachLanes + lane }
  })
  const numSocialLanes = social.length > 0 ? Math.max(socialLaneEnd.length, 1) : 0

  // Other (bookings etc): overlap detection after social
  const otherSorted = [...other].sort((a, b) => toMins(a.start_time) - toMins(b.start_time))
  const otherLaneEnd = []
  const otherBase = numCoachLanes + numSocialLanes
  const otherPlaced = otherSorted.map(ev => {
    const s = toMins(ev.start_time)
    let lane = otherLaneEnd.findIndex(e => e <= s)
    if (lane === -1) { lane = otherLaneEnd.length; otherLaneEnd.push(0) }
    otherLaneEnd[lane] = toMins(ev.end_time)
    return { ...ev, lane: otherBase + lane }
  })
  const numOtherLanes = otherLaneEnd.length

  const totalLanes = Math.max(numCoachLanes + numSocialLanes + numOtherLanes, 1)
  return [...coachPlaced, ...socialPlaced, ...otherPlaced].map(ev => ({ ...ev, totalLanes }))
}

// ─── Component ──────────────────────────────────────────────────────────────

// ── Homepage Cards Tab ───────────────────────────────────────────────────────
function HomepageCardsTab() {
  const [cards, setCards] = useState([])
  const [uploading, setUploading] = useState({})

  useEffect(() => {
    homepageAPI.getCards().then(r => setCards(r.data.cards)).catch(() => {})
  }, [])

  const handleUpload = async (id, file) => {
    if (!file) return
    setUploading(p => ({ ...p, [id]: true }))
    try {
      const fd = new FormData()
      fd.append('image', file)
      await homepageAPI.uploadImage(id, fd)
      const r = await homepageAPI.getCards()
      setCards(r.data.cards)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Upload failed.')
    } finally {
      setUploading(p => ({ ...p, [id]: false }))
    }
  }

  const handleRemove = async (id) => {
    if (!confirm('Remove photo for this card?')) return
    try {
      await homepageAPI.deleteImage(id)
      setCards(prev => prev.map(c => c.id === id ? { ...c, hasImage: false } : c))
    } catch { alert('Could not remove image.') }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-gray-900 text-lg font-medium">Homepage Cards</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.id} className="card space-y-3">
            {/* Photo preview */}
            <div className="relative h-40 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
              {card.hasImage ? (
                <>
                  <img
                    src={`${homepageAPI.getImageUrl(card.id)}?t=${Date.now()}`}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleRemove(card.id)}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 text-gray-900 rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
                  >✕</button>
                </>
              ) : (
                <span className="text-gray-800 text-xs">No photo</span>
              )}
            </div>
            <p className="text-gray-900 text-sm font-medium">{card.title}</p>
            <label className="block">
              <span className="btn-secondary text-xs py-1.5 px-3 cursor-pointer w-full text-center block">
                {uploading[card.id] ? 'Uploading…' : card.hasImage ? 'Replace Photo' : 'Upload Photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading[card.id]}
                onChange={e => handleUpload(card.id, e.target.files[0])}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Reusable banner slot grid ─────────────────────────────────────────────────
function BannerSlotsGrid({ slots, prefix, onUpload, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {slots.map((slot, idx) => (
        <div key={slot.key}
          className="relative h-28 bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 group"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onUpload(idx, e.dataTransfer.files[0]) }}
        >
          <label htmlFor={`${prefix}-input-${idx}`} className="absolute inset-0 flex items-center justify-center cursor-pointer">
            {slot.hasImage ? (
              <>
                <img src={`${pagesAPI.getImageUrl(slot.key)}?t=${slot.ts}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">{idx + 1}</span>
              </>
            ) : (
              <div className="text-center pointer-events-none">
                {slot.uploading ? <span className="text-gray-400 text-xs">Uploading…</span> : (
                  <>
                    <svg className="w-6 h-6 text-gray-300 mx-auto mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.344 11.095" /></svg>
                    <span className="text-gray-400 text-[10px]">Slot {idx + 1}</span>
                  </>
                )}
              </div>
            )}
          </label>
          {slot.hasImage && (
            <button onClick={() => onDelete(idx)} className="absolute top-1 right-1 z-10 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          )}
          <input id={`${prefix}-input-${idx}`} type="file" accept="image/*" className="hidden" disabled={slot.uploading}
            onChange={e => { onUpload(idx, e.target.files[0]); e.target.value = '' }} />
        </div>
      ))}
    </div>
  )
}

// ── Club Settings Tab ─────────────────────────────────────────────────────────
function ClubSettingsTab() {
  const { club, setClub } = useClub() ?? {}
  const [form, setForm] = React.useState({
    name:          '',
    contactPhone:  '',
    contactEmail:  '',
    address:       '',
    wechat:        '',
    primaryColor:  '#2563eb',
    primaryDark:   '#1d4ed8',
    logoUrl:       '',
  })
  const [saving, setSaving] = React.useState(false)
  const [saved,  setSaved]  = React.useState(false)

  React.useEffect(() => {
    if (!club) return
    const s = club.settings ?? {}
    const t = s.theme ?? {}
    setForm({
      name:         club.name          ?? '',
      contactPhone: s.contactPhone     ?? '',
      contactEmail: s.contactEmail     ?? '',
      address:      s.address          ?? '',
      wechat:       s.wechat           ?? '',
      primaryColor: t.primaryColor     ?? '#2563eb',
      primaryDark:  t.primaryDark      ?? '#1d4ed8',
      logoUrl:      t.logoUrl          ?? '',
    })
  }, [club])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      const payload = {
        name: form.name,
        settings: {
          ...(club?.settings ?? {}),
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail,
          address:      form.address,
          wechat:       form.wechat,
          theme: {
            ...(club?.settings?.theme ?? {}),
            primaryColor: form.primaryColor,
            primaryDark:  form.primaryDark,
            logoUrl:      form.logoUrl,
          },
        },
      }
      const r = await clubAPI.update(payload)
      setClub(r.data.club)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { alert('Save failed.') }
    finally { setSaving(false) }
  }

  const field = (label, key, type = 'text', extra = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {type === 'textarea'
        ? <textarea
            rows={3}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...extra}
          />
        : <input
            type={type}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...extra}
          />
      }
    </div>
  )

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">Club Settings</h2>

      {/* Identity */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Identity</h3>
        {field('Club Name', 'name')}
        {field('Logo URL', 'logoUrl', 'text', { placeholder: '/logo.png or https://…' })}
      </section>

      {/* Contact */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Contact</h3>
        {field('Phone', 'contactPhone')}
        {field('Email', 'contactEmail', 'email')}
        {field('Address', 'address', 'textarea')}
        {field('WeChat ID', 'wechat')}
      </section>

      {/* Theme */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Theme</h3>
        <div className="flex gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Primary Colour</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded cursor-pointer border border-gray-300" />
              <span className="text-sm text-gray-500">{form.primaryColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Primary Dark</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryDark} onChange={e => setForm(f => ({ ...f, primaryDark: e.target.value }))}
                className="w-10 h-10 rounded cursor-pointer border border-gray-300" />
              <span className="text-sm text-gray-500">{form.primaryDark}</span>
            </div>
          </div>
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  )
}

// ── Pages CMS Tab ─────────────────────────────────────────────────────────────
const PAGE_SUBTABS = ['Cards', 'Home', 'About Us', 'Training']

const DEFAULT_HOME_HERO    = { headline: 'Epping Table Tennis', subheadline: "Sydney's Premier Table Tennis Club" }
const DEFAULT_HOME_INTRO   = { headline: 'More Than Just a Club', body1: "Founded in 2015, Epping Table Tennis Club has grown into Sydney's premier destination for players of all levels.", body2: "We offer six competition-grade courts, certified coaching, weekly social nights, and a vibrant tournament calendar." }
const DEFAULT_HOME_CONTACT = {
  phone: '(02) 9876 5432', email: 'info@eppingttclub.com.au',
  address: '33 Oxford St\nEpping NSW 2121\nAustralia', wechat: '',
  gettingHere: '2 min walk from Epping Station\nBus stop directly outside\nFree parking on-site',
  schedule: [
    { day: 'Mon', time: '4:00 – 8:30 PM' }, { day: 'Tue', time: '4:00 – 8:30 PM' },
    { day: 'Wed', time: '4:00 – 8:30 PM' }, { day: 'Sat', time: '1:00 – 6:30 PM' },
  ],
}
const DEFAULT_ABOUT_STORY    = { headline: 'More Than Just a Club', body1: '', body2: '' }
const DEFAULT_ABOUT_COACHING = { headline: 'World-Class Coaching', body1: '', body2: '' }
const DEFAULT_ABOUT_COACHES  = { coaches: [
  { name: 'David Chen',  title: 'Head Coach',               bio: '' },
  { name: 'Sarah Kim',   title: 'Junior Development Coach',  bio: '' },
  { name: 'Marcus Liu',  title: 'Fitness & Strategy Coach',  bio: '' },
] }
const DEFAULT_TRAINING_INTRO = { headline: 'Training Programs', subheadline: 'From beginner to competitive — we have a program designed for every stage of your journey.' }
const TRAINING_PROGRAM_IDS   = ['private', 'group', 'school', 'holiday']
const DEFAULT_TRAINING_PROGRAMS = {
  private: { label: 'One-on-One',       tagline: 'Personalised sessions tailored entirely to your game',       description: '', features: [] },
  group:   { label: 'Group Session',    tagline: 'Learn together, improve together',                           description: '', features: [] },
  school:  { label: 'School Coaching',  tagline: 'Bringing table tennis to the classroom',                     description: '', features: [] },
  holiday: { label: 'School Holiday',   tagline: 'Fun, intensive programs during school holidays',             description: '', features: [] },
}

function ImageUploadBox({ imageUrl, fallback, onUpload, onDelete, uploading }) {
  const uid = React.useId()
  const [hasImg, setHasImg] = React.useState(false)
  const [ts, setTs] = React.useState(Date.now())
  React.useEffect(() => {
    const img = new Image()
    img.onload  = () => { setHasImg(true);  setTs(Date.now()) }
    img.onerror = () => { setHasImg(false) }
    img.src = imageUrl
  }, [imageUrl])
  const handleDrop = e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { onUpload(f); setTs(Date.now()) } }
  const handleChange = e => { const f = e.target.files[0]; if (f) { onUpload(f); setTs(Date.now()) }; e.target.value = '' }
  return (
    <div className="relative h-32 bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 group"
      onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <label htmlFor={uid} className="absolute inset-0 flex items-center justify-center cursor-pointer">
        {hasImg
          ? <img src={`${imageUrl}?t=${ts}`} alt="" className="w-full h-full object-cover" onError={() => setHasImg(false)} />
          : <span className="text-gray-400 text-xs text-center px-2">{uploading ? 'Uploading…' : fallback || 'Drag & drop or click to upload'}</span>
        }
      </label>
      {hasImg && (
        <button onClick={() => { onDelete(); setHasImg(false) }}
          className="absolute top-1 right-1 z-10 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
      )}
      <input id={uid} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleChange} />
    </div>
  )
}

function SaveButton({ onSave, saving, saved }) {
  return (
    <button onClick={onSave} disabled={saving} className="btn-primary text-sm py-1.5 px-4 mt-2">
      {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
    </button>
  )
}

const BANNER_SLOTS = 6
const FALLBACK_BANNERS = ['/images/ETTC1.jpg','/images/ETTC2.jpg','/images/ETTC3.jpg','/images/ETTC4.jpg','/images/ETTC5.jpg','/images/ETTC6.jpg']

function HomePagePreview({
  hero, setHero,
  intro, setIntro,
  contact, setContact,
  bannerSrcs, bannerSrcs2, bannerSrcs3,
  onUploadBanner1, onUploadBanner2, onUploadBanner3,
}) {
  const srcs  = bannerSrcs?.length  ? bannerSrcs  : FALLBACK_BANNERS
  const srcs2 = bannerSrcs2?.length ? bannerSrcs2 : FALLBACK_BANNERS
  const srcs3 = bannerSrcs3?.length ? bannerSrcs3 : FALLBACK_BANNERS
  const [cur,  setCur]  = React.useState(0)
  const [cur2, setCur2] = React.useState(0)
  const [cur3, setCur3] = React.useState(0)
  const b1Ref = React.useRef(); const b2Ref = React.useRef(); const b3Ref = React.useRef()
  React.useEffect(() => { setCur(0)  }, [srcs.length])
  React.useEffect(() => { setCur2(0) }, [srcs2.length])
  React.useEffect(() => { setCur3(0) }, [srcs3.length])
  React.useEffect(() => {
    const t = setInterval(() => setCur(i => (i + 1) % srcs.length), 3000)
    return () => clearInterval(t)
  }, [srcs.length])
  React.useEffect(() => {
    const t = setInterval(() => setCur2(i => (i + 1) % srcs2.length), 3500)
    return () => clearInterval(t)
  }, [srcs2.length])
  React.useEffect(() => {
    const t = setInterval(() => setCur3(i => (i + 1) % srcs3.length), 4000)
    return () => clearInterval(t)
  }, [srcs3.length])

  const saveHero    = (h) => pagesAPI.updateContent('home_hero',    h).catch(() => {})
  const saveIntro   = (d) => pagesAPI.updateContent('home_intro',   d).catch(() => {})
  const saveContact = (c) => pagesAPI.updateContent('home_contact', c).catch(() => {})

  const schedule = contact?.schedule ?? []

  return (
    <EditModeContext.Provider value={{ isEditing: true, setIsEditing: () => {} }}>
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg" style={{ height: '88vh' }}>
        {/* Browser chrome */}
        <div className="bg-gray-100 px-3 py-2 flex items-center gap-2 border-b border-gray-200 flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 block" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 block" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 block" />
          <div className="flex-1 mx-2 bg-white rounded text-[10px] text-gray-400 px-2 py-0.5 text-center truncate">eppingttclub.com.au</div>
          <span className="text-[9px] text-blue-500 font-medium whitespace-nowrap">✎ Click to edit</span>
        </div>
        {/* Scrollable page */}
        <div className="overflow-y-auto bg-white" style={{ height: 'calc(88vh - 33px)' }}>
          {/* Nav stub */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
            <span className="text-xs tracking-widest text-gray-400 uppercase">Menu</span>
            <span className="text-sm tracking-[0.15em] text-gray-900 font-medium">EPPING TABLE TENNIS</span>
            <span className="w-6 h-6 rounded-full bg-gray-200" />
          </div>

          {/* Hero — Banner 1 */}
          <div className="relative overflow-hidden group" style={{ height: 260 }}>
            {srcs.map((src, i) => (
              <img key={src} src={src} alt="" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700" style={{ opacity: i === cur ? 1 : 0 }} />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/20 pointer-events-none" />
            <button onClick={() => b1Ref.current?.click()} className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={12} /> Replace Image
            </button>
            <input ref={b1Ref} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) onUploadBanner1?.(e.target.files[0]); e.target.value = '' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-center px-6">
              <EditableText as="p" value={hero?.subheadline ?? ''} onChange={v => setHero(h => ({...h, subheadline: v}))} onSave={v => setHero(h => { const u = {...h, subheadline: v}; saveHero(u); return u })} className="text-white/60 text-xs tracking-[0.3em] uppercase mb-2" />
              <EditableText as="p" value={hero?.headline ?? ''} onChange={v => setHero(h => ({...h, headline: v}))} onSave={v => setHero(h => { const u = {...h, headline: v}; saveHero(u); return u })} className="text-white text-2xl font-normal tracking-tight leading-tight" />
            </div>
          </div>

          {/* Intro */}
          <div className="px-8 py-10 text-center border-b border-gray-100">
            <EditableText as="h2" value={intro?.headline ?? ''} onChange={v => setIntro(d => ({...d, headline: v}))} onSave={v => setIntro(d => { const u = {...d, headline: v}; saveIntro(u); return u })} className="text-3xl font-bold text-black mb-4" />
            <EditableText as="p" value={intro?.body1 ?? ''} onChange={v => setIntro(d => ({...d, body1: v}))} onSave={v => setIntro(d => { const u = {...d, body1: v}; saveIntro(u); return u })} multiline className="text-gray-600 leading-relaxed mb-3" />
            <EditableText as="p" value={intro?.body2 ?? ''} onChange={v => setIntro(d => ({...d, body2: v}))} onSave={v => setIntro(d => { const u = {...d, body2: v}; saveIntro(u); return u })} multiline className="text-gray-600 leading-relaxed" />
          </div>

          {/* Banner 2 */}
          <div className="relative overflow-hidden group" style={{ height: 180 }}>
            {srcs2.map((src, i) => (
              <img key={src} src={src} alt="" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700" style={{ opacity: i === cur2 ? 1 : 0 }} />
            ))}
            <button onClick={() => b2Ref.current?.click()} className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={12} /> Replace Image
            </button>
            <input ref={b2Ref} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) onUploadBanner2?.(e.target.files[0]); e.target.value = '' }} />
          </div>

          {/* Training programs */}
          <div className="px-8 py-8 border-b border-gray-100">
            <p className="text-xs font-bold text-black text-center mb-6 tracking-widest uppercase">Training Programs</p>
            <div className="grid grid-cols-4 gap-4">
              {['One-on-One','Group','School','Holiday'].map(t => (
                <div key={t} className="bg-gray-100 aspect-[3/4] rounded flex items-end p-2">
                  <p className="text-xs text-gray-500 text-center w-full">{t}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Banner 3 */}
          <div className="relative overflow-hidden group" style={{ height: 180 }}>
            {srcs3.map((src, i) => (
              <img key={src} src={src} alt="" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700" style={{ opacity: i === cur3 ? 1 : 0 }} />
            ))}
            <button onClick={() => b3Ref.current?.click()} className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={12} /> Replace Image
            </button>
            <input ref={b3Ref} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) onUploadBanner3?.(e.target.files[0]); e.target.value = '' }} />
          </div>

          {/* Schedule */}
          <div className="px-8 py-8 border-b border-gray-100">
            <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-2 text-center">Opening Hours</p>
            <p className="text-xl font-bold text-black text-center mb-6">Weekly Schedule</p>
            <div className="divide-y divide-gray-100 border-t border-gray-100 mb-4">
              {schedule.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <EditableText as="span" value={row.day} onChange={v => setContact(c => ({...c, schedule: c.schedule.map((r, ri) => ri === i ? {...r, day: v} : r)}))} onSave={v => setContact(c => { const s = c.schedule.map((r, ri) => ri === i ? {...r, day: v} : r); const u = {...c, schedule: s}; saveContact(u); return u })} className="font-bold text-black text-sm w-10 flex-shrink-0" />
                  <span className="text-gray-400 text-xs flex-1 text-center">Open Practice</span>
                  <EditableText as="span" value={row.time} onChange={v => setContact(c => ({...c, schedule: c.schedule.map((r, ri) => ri === i ? {...r, time: v} : r)}))} onSave={v => setContact(c => { const s = c.schedule.map((r, ri) => ri === i ? {...r, time: v} : r); const u = {...c, schedule: s}; saveContact(u); return u })} className="text-gray-600 text-xs w-32 text-right flex-shrink-0" />
                  <button onClick={() => setContact(c => { const u = {...c, schedule: c.schedule.filter((_, ri) => ri !== i)}; saveContact(u); return u })} className="text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setContact(c => { const u = {...c, schedule: [...c.schedule, {day: 'New', time: '9:00 – 5:00 PM'}]}; saveContact(u); return u })} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition-colors">
              <Plus size={13} /> Add row
            </button>
          </div>

          {/* Location */}
          <div className="px-8 py-8 bg-gray-50">
            <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-2 text-center">Location</p>
            <p className="text-xl font-bold text-black text-center mb-6">Find Us</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="font-semibold text-gray-700 mb-2 uppercase text-xs tracking-wide">Address</p>
                <EditableText as="p" value={contact?.address ?? ''} onChange={v => setContact(c => ({...c, address: v}))} onSave={v => setContact(c => { const u = {...c, address: v}; saveContact(u); return u })} multiline className="text-gray-600 text-sm whitespace-pre-line" />
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-2 uppercase text-xs tracking-wide">Contact</p>
                <EditableText as="p" value={contact?.phone ?? ''} onChange={v => setContact(c => ({...c, phone: v}))} onSave={v => setContact(c => { const u = {...c, phone: v}; saveContact(u); return u })} className="text-gray-600 text-sm" />
                <EditableText as="p" value={contact?.email ?? ''} onChange={v => setContact(c => ({...c, email: v}))} onSave={v => setContact(c => { const u = {...c, email: v}; saveContact(u); return u })} className="text-gray-600 text-sm mt-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </EditModeContext.Provider>
  )
}

function PagesTab() {
  const [sub, setSub] = React.useState('Cards')
  const { club } = useClub() ?? {}

  // ── Home state ──
  const [hero, setHero] = React.useState(() => ({
    ...DEFAULT_HOME_HERO,
    headline: club?.name ?? DEFAULT_HOME_HERO.headline,
  }))
  const [contact, setContact] = React.useState(() => ({
    ...DEFAULT_HOME_CONTACT,
    phone:   club?.settings?.contactPhone || DEFAULT_HOME_CONTACT.phone,
    email:   club?.settings?.contactEmail || DEFAULT_HOME_CONTACT.email,
    address: club?.settings?.address      || DEFAULT_HOME_CONTACT.address,
    wechat:  club?.settings?.wechat       ?? DEFAULT_HOME_CONTACT.wechat,
  }))
  const [intro, setIntro] = React.useState(DEFAULT_HOME_INTRO)
  const [heroSaving, setHeroSaving]       = React.useState(false); const [heroSaved, setHeroSaved] = React.useState(false)
  const [contactSaving, setContactSaving] = React.useState(false); const [contactSaved, setContactSaved] = React.useState(false)
  // banner slots: array of { key, hasImage, ts, uploading }
  const [bannerSlots,  setBannerSlots]  = React.useState(
    Array.from({ length: BANNER_SLOTS }, (_, i) => ({ key: `home_banner_${i}`,  hasImage: false, ts: Date.now(), uploading: false }))
  )
  const [bannerSlots2, setBannerSlots2] = React.useState(
    Array.from({ length: BANNER_SLOTS }, (_, i) => ({ key: `home_banner2_${i}`, hasImage: false, ts: Date.now(), uploading: false }))
  )
  const [bannerSlots3, setBannerSlots3] = React.useState(
    Array.from({ length: BANNER_SLOTS }, (_, i) => ({ key: `home_banner3_${i}`, hasImage: false, ts: Date.now(), uploading: false }))
  )
  const bannerSrcs  = bannerSlots.filter(s => s.hasImage).map(s => `${pagesAPI.getImageUrl(s.key)}?t=${s.ts}`)
  const bannerSrcs2 = bannerSlots2.filter(s => s.hasImage).map(s => `${pagesAPI.getImageUrl(s.key)}?t=${s.ts}`)
  const bannerSrcs3 = bannerSlots3.filter(s => s.hasImage).map(s => `${pagesAPI.getImageUrl(s.key)}?t=${s.ts}`)

  // ── About state ──
  const [story,    setStory]    = React.useState(DEFAULT_ABOUT_STORY)
  const [coaching, setCoaching] = React.useState(DEFAULT_ABOUT_COACHING)
  const [coaches,  setCoaches]  = React.useState(DEFAULT_ABOUT_COACHES.coaches)
  const [storySaving,    setStorySaving]    = React.useState(false); const [storySaved,    setStorySaved]    = React.useState(false)
  const [coachingSaving, setCoachingSaving] = React.useState(false); const [coachingSaved, setCoachingSaved] = React.useState(false)
  const [coachesSaving,  setCoachesSaving]  = React.useState(false); const [coachesSaved,  setCoachesSaved]  = React.useState(false)
  const [imgUploading, setImgUploading] = React.useState({})

  // ── Training state ──
  const [trainingIntro,    setTrainingIntro]    = React.useState(DEFAULT_TRAINING_INTRO)
  const [trainingPrograms, setTrainingPrograms] = React.useState(DEFAULT_TRAINING_PROGRAMS)
  const [trainingIntroSaving, setTrainingIntroSaving] = React.useState(false); const [trainingIntroSaved, setTrainingIntroSaved] = React.useState(false)
  const [trainingSaving, setTrainingSaving] = React.useState({}); const [trainingSaved, setTrainingSaved] = React.useState({})
  const [cardUploading, setCardUploading] = React.useState({})

  React.useEffect(() => {
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.home_hero)       setHero(h => ({ ...h, ...c.home_hero }))
      if (c.home_intro)      setIntro(d => ({ ...d, ...c.home_intro }))
      if (c.home_contact)    setContact(h => ({ ...h, ...c.home_contact }))
      if (c.about_story)     setStory(h => ({ ...h, ...c.about_story }))
      if (c.about_coaching)  setCoaching(h => ({ ...h, ...c.about_coaching }))
      if (c.about_coaches?.coaches) setCoaches(c.about_coaches.coaches)
      if (c.training_intro)  setTrainingIntro(h => ({ ...h, ...c.training_intro }))
      TRAINING_PROGRAM_IDS.forEach(id => {
        if (c[`training_${id}`]) setTrainingPrograms(p => ({ ...p, [id]: { ...p[id], ...c[`training_${id}`] } }))
      })
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner_').then(r => {
      const populated = new Set(r.data.ids)
      setBannerSlots(prev => prev.map(s => ({ ...s, hasImage: populated.has(s.key) })))
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner2').then(r => {
      const populated = new Set(r.data.ids)
      setBannerSlots2(prev => prev.map(s => ({ ...s, hasImage: populated.has(s.key) })))
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner3').then(r => {
      const populated = new Set(r.data.ids)
      setBannerSlots3(prev => prev.map(s => ({ ...s, hasImage: populated.has(s.key) })))
    }).catch(() => {})
  }, [])

  const saveSection = async (id, data, setSaving, setSaved) => {
    setSaving(true); setSaved(false)
    try { await pagesAPI.updateContent(id, data); setSaved(true); setTimeout(() => setSaved(false), 3000) }
    catch { alert('Save failed.') }
    finally { setSaving(false) }
  }

  const uploadBanner = async (idx, file) => {
    if (!file) return
    const key = `home_banner_${idx}`
    setBannerSlots(prev => prev.map((s, i) => i === idx ? { ...s, uploading: true } : s))
    try {
      const fd = new FormData(); fd.append('image', file)
      await pagesAPI.uploadImage(key, fd)
      setBannerSlots(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: true, ts: Date.now(), uploading: false } : s))
    } catch (err) { alert('Upload failed: ' + (err.response?.data?.message ?? err.message)); setBannerSlots(prev => prev.map((s, i) => i === idx ? { ...s, uploading: false } : s)) }
  }

  const deleteBanner = async (idx) => {
    const key = `home_banner_${idx}`
    try { await pagesAPI.deleteImage(key); setBannerSlots(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: false } : s)) }
    catch { alert('Delete failed.') }
  }

  const uploadBanner2 = async (idx, file) => {
    if (!file) return
    const key = `home_banner2_${idx}`
    setBannerSlots2(prev => prev.map((s, i) => i === idx ? { ...s, uploading: true } : s))
    try {
      const fd = new FormData(); fd.append('image', file)
      await pagesAPI.uploadImage(key, fd)
      setBannerSlots2(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: true, ts: Date.now(), uploading: false } : s))
    } catch (err) { alert('Upload failed: ' + (err.response?.data?.message ?? err.message)); setBannerSlots2(prev => prev.map((s, i) => i === idx ? { ...s, uploading: false } : s)) }
  }
  const deleteBanner2 = async (idx) => {
    const key = `home_banner2_${idx}`
    try { await pagesAPI.deleteImage(key); setBannerSlots2(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: false } : s)) }
    catch { alert('Delete failed.') }
  }

  const uploadBanner3 = async (idx, file) => {
    if (!file) return
    const key = `home_banner3_${idx}`
    setBannerSlots3(prev => prev.map((s, i) => i === idx ? { ...s, uploading: true } : s))
    try {
      const fd = new FormData(); fd.append('image', file)
      await pagesAPI.uploadImage(key, fd)
      setBannerSlots3(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: true, ts: Date.now(), uploading: false } : s))
    } catch (err) { alert('Upload failed: ' + (err.response?.data?.message ?? err.message)); setBannerSlots3(prev => prev.map((s, i) => i === idx ? { ...s, uploading: false } : s)) }
  }
  const deleteBanner3 = async (idx) => {
    const key = `home_banner3_${idx}`
    try { await pagesAPI.deleteImage(key); setBannerSlots3(prev => prev.map((s, i) => i === idx ? { ...s, hasImage: false } : s)) }
    catch { alert('Delete failed.') }
  }

  // Quick-replace slot 0 of each banner (used by the visual editor "Replace Image" buttons)
  const replaceBanner1 = (file) => uploadBanner(0, file)
  const replaceBanner2 = (file) => uploadBanner2(0, file)
  const replaceBanner3 = (file) => uploadBanner3(0, file)

  const uploadImg = async (key, file) => {
    setImgUploading(p => ({ ...p, [key]: true }))
    try { const fd = new FormData(); fd.append('image', file); await pagesAPI.uploadImage(key, fd) }
    catch (err) { alert('Upload failed: ' + (err.response?.data?.message ?? err.message)) }
    finally { setImgUploading(p => ({ ...p, [key]: false })) }
  }

  const deleteImg = async (key) => {
    try { await pagesAPI.deleteImage(key) } catch { alert('Delete failed.') }
  }

  const uploadCard = async (id, file) => {
    setCardUploading(p => ({ ...p, [id]: true }))
    try { const fd = new FormData(); fd.append('image', file); await homepageAPI.uploadImage(id, fd) }
    catch (err) { alert('Upload failed: ' + (err.response?.data?.message ?? err.message)) }
    finally { setCardUploading(p => ({ ...p, [id]: false })) }
  }

  const deleteCard = async (id) => {
    try { await homepageAPI.deleteImage(id) } catch { alert('Delete failed.') }
  }

  const updateCoach = (i, field, val) => setCoaches(prev => prev.map((c, ci) => ci === i ? { ...c, [field]: val } : c))

  const updateScheduleRow = (i, field, val) =>
    setContact(c => ({ ...c, schedule: c.schedule.map((r, ri) => ri === i ? { ...r, [field]: val } : r) }))

  const updateFeature = (progId, i, val) =>
    setTrainingPrograms(p => ({ ...p, [progId]: { ...p[progId], features: p[progId].features.map((f, fi) => fi === i ? val : f) } }))

  const addFeature = (progId) =>
    setTrainingPrograms(p => ({ ...p, [progId]: { ...p[progId], features: [...(p[progId].features || []), ''] } }))

  const removeFeature = (progId, i) =>
    setTrainingPrograms(p => ({ ...p, [progId]: { ...p[progId], features: p[progId].features.filter((_, fi) => fi !== i) } }))

  return (
    <div className="animate-fade-in space-y-4">
      <h2 className="text-gray-900 text-lg font-medium">Pages CMS</h2>
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {PAGE_SUBTABS.map(t => (
          <button key={t} onClick={() => setSub(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${sub === t ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Cards sub-tab ── */}
      {sub === 'Cards' && <HomepageCardsTab />}

      {/* ── Home sub-tab: banner strip + full-width visual editor ── */}
      {sub === 'Home' && (
        <div className="space-y-4">
          {/* Banner image management — 3 columns */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Banner 1 — Hero</h3>
              <p className="text-xs text-gray-400">Up to {BANNER_SLOTS} images. Use "Replace Image" in the preview to quick-swap, or manage all slots here.</p>
              <BannerSlotsGrid slots={bannerSlots} prefix="banner1" onUpload={uploadBanner} onDelete={deleteBanner} />
            </div>
            <div className="card space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Banner 2 — Mid</h3>
              <p className="text-xs text-gray-400">Full-width image below the intro section.</p>
              <BannerSlotsGrid slots={bannerSlots2} prefix="banner2" onUpload={uploadBanner2} onDelete={deleteBanner2} />
            </div>
            <div className="card space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Banner 3 — Bottom</h3>
              <p className="text-xs text-gray-400">Full-width image below the training programs.</p>
              <BannerSlotsGrid slots={bannerSlots3} prefix="banner3" onUpload={uploadBanner3} onDelete={deleteBanner3} />
            </div>
          </div>
          {/* Full-width visual editor */}
          <HomePagePreview
            hero={hero} setHero={setHero}
            intro={intro} setIntro={setIntro}
            contact={contact} setContact={setContact}
            bannerSrcs={bannerSrcs} bannerSrcs2={bannerSrcs2} bannerSrcs3={bannerSrcs3}
            onUploadBanner1={replaceBanner1}
            onUploadBanner2={replaceBanner2}
            onUploadBanner3={replaceBanner3}
          />
        </div>
      )}

      {/* ── About Us sub-tab ── */}
      {sub === 'About Us' && (
        <div className="space-y-8 max-w-2xl">
          <div className="card space-y-3">
            <h3 className="font-medium text-gray-900">Story Section</h3>
            <label className="block"><span className="text-xs text-gray-500">Headline</span>
              <input className="input mt-1 w-full" value={story.headline} onChange={e => setStory(s => ({ ...s, headline: e.target.value }))} />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Paragraph 1</span>
              <textarea className="input mt-1 w-full h-24 resize-none" value={story.body1} onChange={e => setStory(s => ({ ...s, body1: e.target.value }))} />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Paragraph 2</span>
              <textarea className="input mt-1 w-full h-24 resize-none" value={story.body2} onChange={e => setStory(s => ({ ...s, body2: e.target.value }))} />
            </label>
            <div>
              <p className="text-xs text-gray-500 mb-1">Section Image</p>
              <ImageUploadBox imageUrl={pagesAPI.getImageUrl('about_story')} fallback="Story image" uploading={imgUploading['about_story']} onUpload={f => uploadImg('about_story', f)} onDelete={() => deleteImg('about_story')} />
            </div>
            <SaveButton onSave={() => saveSection('about_story', story, setStorySaving, setStorySaved)} saving={storySaving} saved={storySaved} />
          </div>
          <div className="card space-y-3">
            <h3 className="font-medium text-gray-900">Coaching Section</h3>
            <label className="block"><span className="text-xs text-gray-500">Headline</span>
              <input className="input mt-1 w-full" value={coaching.headline} onChange={e => setCoaching(s => ({ ...s, headline: e.target.value }))} />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Paragraph 1</span>
              <textarea className="input mt-1 w-full h-24 resize-none" value={coaching.body1} onChange={e => setCoaching(s => ({ ...s, body1: e.target.value }))} />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Paragraph 2</span>
              <textarea className="input mt-1 w-full h-24 resize-none" value={coaching.body2} onChange={e => setCoaching(s => ({ ...s, body2: e.target.value }))} />
            </label>
            <div>
              <p className="text-xs text-gray-500 mb-1">Section Image</p>
              <ImageUploadBox imageUrl={pagesAPI.getImageUrl('about_coaching')} fallback="Coaching image" uploading={imgUploading['about_coaching']} onUpload={f => uploadImg('about_coaching', f)} onDelete={() => deleteImg('about_coaching')} />
            </div>
            <SaveButton onSave={() => saveSection('about_coaching', coaching, setCoachingSaving, setCoachingSaved)} saving={coachingSaving} saved={coachingSaved} />
          </div>
          <div className="card space-y-4">
            <h3 className="font-medium text-gray-900">Coaches</h3>
            {coaches.map((coach, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs text-gray-500">Name</span>
                    <input className="input mt-1 w-full" value={coach.name || ''} onChange={e => updateCoach(i, 'name', e.target.value)} />
                  </label>
                  <label className="block"><span className="text-xs text-gray-500">Title</span>
                    <input className="input mt-1 w-full" value={coach.title || ''} onChange={e => updateCoach(i, 'title', e.target.value)} />
                  </label>
                </div>
                <label className="block"><span className="text-xs text-gray-500">Bio</span>
                  <textarea className="input mt-1 w-full h-20 resize-none" value={coach.bio || ''} onChange={e => updateCoach(i, 'bio', e.target.value)} />
                </label>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Photo</p>
                  <ImageUploadBox imageUrl={pagesAPI.getImageUrl(`about_coach_${i}`)} fallback={`Coach ${i + 1} photo`} uploading={imgUploading[`about_coach_${i}`]} onUpload={f => uploadImg(`about_coach_${i}`, f)} onDelete={() => deleteImg(`about_coach_${i}`)} />
                </div>
              </div>
            ))}
            <button onClick={() => setCoaches(prev => [...prev, { name: '', title: '', bio: '' }])} className="text-sm text-gray-500 hover:text-black">+ Add Coach</button>
            <SaveButton onSave={() => saveSection('about_coaches', { coaches }, setCoachesSaving, setCoachesSaved)} saving={coachesSaving} saved={coachesSaved} />
          </div>
        </div>
      )}

      {/* ── Training sub-tab ── */}
      {sub === 'Training' && (
        <div className="space-y-8 max-w-2xl">
          <div className="card space-y-3">
            <h3 className="font-medium text-gray-900">Page Header</h3>
            <label className="block"><span className="text-xs text-gray-500">Headline</span>
              <input className="input mt-1 w-full" value={trainingIntro.headline} onChange={e => setTrainingIntro(s => ({ ...s, headline: e.target.value }))} />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Subheadline</span>
              <input className="input mt-1 w-full" value={trainingIntro.subheadline} onChange={e => setTrainingIntro(s => ({ ...s, subheadline: e.target.value }))} />
            </label>
            <SaveButton onSave={() => saveSection('training_intro', trainingIntro, setTrainingIntroSaving, setTrainingIntroSaved)} saving={trainingIntroSaving} saved={trainingIntroSaved} />
          </div>
          {TRAINING_PROGRAM_IDS.map(id => {
            const prog = trainingPrograms[id]
            return (
              <div key={id} className="card space-y-3">
                <h3 className="font-medium text-gray-900 capitalize">{prog.label}</h3>
                <label className="block"><span className="text-xs text-gray-500">Label</span>
                  <input className="input mt-1 w-full" value={prog.label || ''} onChange={e => setTrainingPrograms(p => ({ ...p, [id]: { ...p[id], label: e.target.value } }))} />
                </label>
                <label className="block"><span className="text-xs text-gray-500">Tagline</span>
                  <input className="input mt-1 w-full" value={prog.tagline || ''} onChange={e => setTrainingPrograms(p => ({ ...p, [id]: { ...p[id], tagline: e.target.value } }))} />
                </label>
                <label className="block"><span className="text-xs text-gray-500">Description</span>
                  <textarea className="input mt-1 w-full h-24 resize-none" value={prog.description || ''} onChange={e => setTrainingPrograms(p => ({ ...p, [id]: { ...p[id], description: e.target.value } }))} />
                </label>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Features</p>
                  {(prog.features || []).map((f, fi) => (
                    <div key={fi} className="flex gap-2 mb-1">
                      <input className="input flex-1" value={f} onChange={e => updateFeature(id, fi, e.target.value)} />
                      <button onClick={() => removeFeature(id, fi)} className="text-red-500 text-sm px-2">✕</button>
                    </div>
                  ))}
                  <button onClick={() => addFeature(id)} className="text-sm text-gray-500 hover:text-black">+ Add feature</button>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Card Image</p>
                  <ImageUploadBox imageUrl={homepageAPI.getImageUrl(id)} fallback={`${prog.label} image`} uploading={cardUploading[id]} onUpload={f => uploadCard(id, f)} onDelete={() => deleteCard(id)} />
                </div>
                <SaveButton onSave={() => saveSection(`training_${id}`, prog, s => setTrainingSaving(p => ({ ...p, [id]: s })), s => setTrainingSaved(p => ({ ...p, [id]: s })))} saving={trainingSaving[id]} saved={trainingSaved[id]} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Articles Manager ──────────────────────────────────────────────────────────
const ARTICLE_TYPES = ['competition', 'news', 'achievement']
const TYPE_LABELS   = { competition: 'Competition', news: 'News', achievement: 'Achievement' }

function ArticlesManager() {
  const [articles, setArticles]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing,  setEditing]    = useState(null) // article being edited
  const [deleting, setDeleting]   = useState(null)
  const [saving,   setSaving]     = useState(false)
  const [filterType, setFilterType] = useState('')

  const emptyForm = { type: 'news', title: '', subtitle: '', body: '', image_data: '', image_type: '', is_pinned: false, published_at: new Date().toISOString().slice(0,16) }
  const [form, setForm] = useState(emptyForm)

  const load = () => {
    setLoading(true)
    const params = filterType ? { type: filterType } : {}
    articlesAPI.getAll(params)
      .then(r => setArticles(r.data.articles))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [filterType])

  const openNew  = () => { setForm(emptyForm); setEditing(null); setShowForm(true) }
  const openEdit = (a) => {
    setForm({ type: a.type, title: a.title, subtitle: a.subtitle||'', body: a.body||'',
              image_data: a.image_data||'', image_type: a.image_type||'',
              is_pinned: a.is_pinned, published_at: new Date(a.published_at).toISOString().slice(0,16) })
    setEditing(a)
    setShowForm(true)
  }

  const handleImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, image_data: ev.target.result, image_type: file.type }))
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return alert('Title is required.')
    setSaving(true)
    try {
      const payload = { ...form, published_at: new Date(form.published_at).toISOString() }
      if (editing) await articlesAPI.update(editing.id, payload)
      else         await articlesAPI.create(payload)
      setShowForm(false)
      load()
    } catch (e) {
      alert(e.response?.data?.message ?? 'Error saving article.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await articlesAPI.delete(id)
      setDeleting(null)
      load()
    } catch { alert('Could not delete.') }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Articles</h2>
        <button onClick={openNew}
          className="flex items-center gap-1.5 bg-black text-white text-sm px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{key:'',label:'All'}, ...ARTICLE_TYPES.map(t=>({key:t,label:TYPE_LABELS[t]}))].map(t => (
          <button key={t.key} onClick={() => setFilterType(t.key)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${filterType===t.key ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin" /></div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No articles yet. Click "New Article" to add one.</div>
      ) : (
        <div className="space-y-3">
          {articles.map(a => (
            <div key={a.id} className="flex gap-4 items-start bg-white border border-gray-200 rounded-xl p-4">
              {a.image_data && (
                <img src={a.image_data} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    a.type==='competition' ? 'bg-blue-100 text-blue-700' :
                    a.type==='achievement' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'}`}>
                    {TYPE_LABELS[a.type]}
                  </span>
                  {a.is_pinned && <span className="text-[10px] text-gray-400">📌 Pinned</span>}
                </div>
                <p className="font-medium text-gray-900 truncate">{a.title}</p>
                {a.subtitle && <p className="text-sm text-gray-500 truncate">{a.subtitle}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(a.published_at).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'})}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(a)}
                  className="text-xs text-gray-500 hover:text-black border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">Edit</button>
                <button onClick={() => setDeleting(a.id)}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
             onClick={e => { if (e.target===e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-base font-semibold">{editing ? 'Edit Article' : 'New Article'}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
                  {ARTICLE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input type="datetime-local" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.published_at} onChange={e => setForm(f=>({...f,published_at:e.target.value}))} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Title *</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Article title" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Short description" value={form.subtitle} onChange={e => setForm(f=>({...f,subtitle:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Body</label>
              <textarea rows={6} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                placeholder="Full article content…" value={form.body} onChange={e => setForm(f=>({...f,body:e.target.value}))} />
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cover Image</label>
              {form.image_data && (
                <div className="relative mb-2">
                  <img src={form.image_data} alt="" className="w-full h-40 object-cover rounded-lg" />
                  <button onClick={() => setForm(f=>({...f,image_data:'',image_type:''}))}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500 hover:text-black border border-dashed border-gray-300 rounded-lg px-4 py-3 transition-colors">
                <Camera className="w-4 h-4" />
                <span>{form.image_data ? 'Change image' : 'Upload image'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 rounded"
                checked={form.is_pinned} onChange={e => setForm(f=>({...f,is_pinned:e.target.checked}))} />
              <span className="text-gray-700">Pin to top (shown as hero)</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <p className="text-sm text-gray-700">Delete this article? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2 rounded-full border border-gray-200 text-sm">Cancel</button>
              <button onClick={() => handleDelete(deleting)}
                className="flex-1 py-2 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const [activeTab,    setActiveTab]    = useState('Bookings')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_tab_order')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Validate: length must match current TABS (resets if tabs were added/removed)
        if (Array.isArray(parsed) && parsed.length === TABS.length &&
            parsed.every(i => Number.isInteger(i) && i >= 0 && i < TABS.length)) {
          return parsed
        }
        localStorage.removeItem('admin_tab_order')
      }
    } catch {}
    return TABS.map((_, i) => i)
  })
  const [dragTabIdx,     setDragTabIdx]     = useState(null)
  const [dragTabOverIdx, setDragTabOverIdx] = useState(null)

  const handleTabDragStart = (e, idx) => {
    setDragTabIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleTabDragOver = (e, idx) => {
    e.preventDefault()
    setDragTabOverIdx(idx)
  }
  const handleTabDrop = (e, idx) => {
    e.preventDefault()
    if (dragTabIdx === null || dragTabIdx === idx) return
    const newOrder = [...tabOrder]
    const [moved] = newOrder.splice(dragTabIdx, 1)
    newOrder.splice(idx, 0, moved)
    setTabOrder(newOrder)
    localStorage.setItem('admin_tab_order', JSON.stringify(newOrder))
    setDragTabIdx(null)
    setDragTabOverIdx(null)
  }
  const handleTabDragEnd = () => {
    setDragTabIdx(null)
    setDragTabOverIdx(null)
  }
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
  const [memberModalPricingForm, setMemberModalPricingForm] = useState({ solo: '', group: '', saving: false, open: false })
  const [memberModalCoachingExpanded, setMemberModalCoachingExpanded] = useState(new Set())
  const [memberModalGroupExpanded, setMemberModalGroupExpanded] = useState(false)
  const [memberModalFeedbackExpanded, setMemberModalFeedbackExpanded] = useState(new Set()) // session ids
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
  const [allReviews,       setAllReviews]       = useState([])
  const [reviewsLoading,   setReviewsLoading]   = useState(false)
  const [selectedReviewStudent, setSelectedReviewStudent] = useState(null)
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
  const [hoursTarget,        setHoursTarget]        = useState(null)  // { user_id, name, balance, ledger, soloPrice, groupPrice }
  const [hoursLoading,       setHoursLoading]       = useState(false)
  const [hoursForm,          setHoursForm]          = useState({ delta: '', note: '' })
  const [hoursPricingForm,   setHoursPricingForm]   = useState({ solo: '', group: '', saving: false })
  // Hours balance shown inline when scheduling sessions
  const [sessionStudentBalance, setSessionStudentBalance] = useState(null)   // number | null
  const [groupStudentBalances,  setGroupStudentBalances]  = useState({})     // { [userId]: number }
  // Hours balances for all students visible in the session tables
  const [sessionBalances,       setSessionBalances]       = useState({})     // { [userId]: number }
  // Cancel + makeup modal
  const [cancelModal, setCancelModal] = useState(null)
  // Transfer modal
  const [transferModal, setTransferModal] = useState(null)
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
  const [expandedCoaches, setExpandedCoaches] = useState({})

  // Venue tab state
  const [venueDate,       setVenueDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [venueCheckins,   setVenueCheckins]   = useState([])
  const [venueLoading,    setVenueLoading]    = useState(false)
  const [venueQR,         setVenueQR]         = useState(null)   // { url, token, club_name }
  const [venueQRLoading,  setVenueQRLoading]  = useState(false)
  const [venueRegenConfirm, setVenueRegenConfirm] = useState(false)

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
    title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12, weeks: 1, price_cents: 0,
  })
  // { [sessionId]: { title, date, start_time, end_time, max_players } } — unified edit state
  const [editingTimes,   setEditingTimes]   = useState({})   // kept for legacy refs, unused after refactor
  const [editingDetails, setEditingDetails] = useState({})   // kept for legacy refs, unused after refactor
  const [editingSocial,  setEditingSocial]  = useState({})   // unified: { [sessionId]: { title, date, start_time, end_time, max_players } }
  // cancel-series selection modal
  const [cancelSeriesModal, setCancelSeriesModal] = useState(null) // { recurrenceId, sessions: [], selected: Set }
  const [calendarReschedule, setCalendarReschedule] = useState(null) // { type:'solo'|'group', ev, newDate, saving }
  const [socialCalendarEdit, setSocialCalendarEdit] = useState(null) // { id, title, num_courts, max_players, date, start_time, end_time, saving }
  const [expandedSeriesIds, setExpandedSeriesIds] = useState(new Set())
  const [editingSeries, setEditingSeries] = useState(null) // { rid, title, start_time, end_time, max_players, price_dollars, saving }
  const [managingSession, setManagingSession] = useState(null) // session id with open participant panel
  // { [sessionId]: { query: '', userId: '' } } — add-member state per session
  const [addingMember, setAddingMember] = useState({})
  const [editingMember, setEditingMember] = useState(null) // { id, name, email }

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

  const handleSaveMemberEdit = async () => {
    if (!editingMember) return
    try {
      const { data } = await adminAPI.updateMember(editingMember.id, { name: editingMember.name, email: editingMember.email })
      setMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, ...data.member } : m))
      setEditingMember(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update member.')
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
    setMemberModal({ member: members.find(m => m.id === memberId) ?? { id: memberId }, bookings: [], coaching: [], social: [], coachSessions: [], balance: 0, soloPrice: null, groupPrice: null, error: null })
    setMemberModalTab('upcoming')
    setMemberModalSelected(new Set())
    setMemberModalEditId(null)
    setMemberModalCoachingExpanded(new Set())
    setMemberModalGroupExpanded(false)
    setMemberModalPricingForm({ solo: '', group: '', saving: false, open: false })
    setMemberModalLoading(true)
    try {
      const [{ data }, { data: pd }] = await Promise.all([
        adminAPI.getMemberActivities(memberId),
        coachingAPI.getStudentPrices(memberId),
      ])
      setMemberModal({ ...data, soloPrice: pd.solo_price, groupPrice: pd.group_price, error: null })
      setMemberModalPricingForm(f => ({ ...f, solo: String(pd.solo_price ?? ''), group: String(pd.group_price ?? '') }))
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

  const handleBookingNoShow = async (intentId) => {
    if (!window.confirm('Charge no-show fee? This will capture the card hold and cannot be undone.')) return
    try {
      await paymentsAPI.capture(intentId)
      alert('No-show fee charged.')
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not charge no-show fee.')
    }
  }

  const handleSocialNoShow = async (intentId, participantName) => {
    if (!window.confirm(`Charge no-show fee for ${participantName}? This will capture the card hold and cannot be undone.`)) return
    try {
      await paymentsAPI.capture(intentId)
      alert('No-show fee charged.')
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not charge no-show fee.')
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

  const handleAdminNoShow = async (sessionId, studentId) => {
    try {
      await checkinAPI.adminNoShowCoaching(sessionId)
      setAdminCheckIns(prev => {
        const key = ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === studentId
        if (prev.some(key)) return prev
        return [...prev, { type: 'coaching', reference_id: String(sessionId), user_id: studentId, no_show: true }]
      })
      setAdminCheckedIn(prev => new Set([...prev, sessionId]))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not mark as no-show.')
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

  // Fetch reviews when Reviews sub-tab is opened
  useEffect(() => {
    if (activeTab !== 'Coaching' || coachingSubTab !== 'reviews') return
    let cancelled = false
    setReviewsLoading(true)
    coachingAPI.getRecentReviews()
      .then(r => { if (!cancelled) setAllReviews(r.data.reviews ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReviewsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, coachingSubTab])

  // Auto-refresh coaching sessions when a substitute coach accepts coverage
  useEffect(() => {
    const handler = () => { if (activeTab === 'Coaching') refreshAfterReschedule() }
    window.addEventListener('coaching-sessions-updated', handler)
    return () => window.removeEventListener('coaching-sessions-updated', handler)
  }, [activeTab, coachingDate])

  // When coaching sessions change, bulk-fetch hours balances for all students shown
  useEffect(() => {
    const ids = [...new Set([
      ...coachingSessions.map(s => s.student_id),
      ...groupSessions.flatMap(g => g.student_ids || []),
    ])].filter(Boolean)
    if (!ids.length) return
    let cancelled = false
    Promise.allSettled(ids.map(id => coachingAPI.getHoursBalance(id).then(r => ({ id, balance: r.data.balance }))))
      .then(results => {
        if (cancelled) return
        const map = {}
        results.forEach(r => { if (r.status === 'fulfilled') map[r.value.id] = r.value.balance })
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
    if (activeTab !== 'Analytics' || !payReport) return
    // Auto-refresh pay report when admin returns to Analytics tab
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

  useEffect(() => {
    if (activeTab !== 'QR-Code') return
    // Load QR once
    if (!venueQR) {
      setVenueQRLoading(true)
      venueAPI.getQR()
        .then(({ data }) => setVenueQR(data))
        .catch(() => {})
        .finally(() => setVenueQRLoading(false))
    }
    // Load today's check-ins
    setVenueLoading(true)
    venueAPI.getToday(venueDate)
      .then(({ data }) => setVenueCheckins(data.checkins ?? []))
      .catch(() => {})
      .finally(() => setVenueLoading(false))
  }, [activeTab, venueDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSocialSession = async () => {
    const { title, description, num_courts, date, start_time, end_time, max_players, weeks, price_cents } = socialForm
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
        price_cents: Math.round(Number(price_cents) * 100) || 0,
      })
      setSocialSessions(prev => [...prev, ...data.sessions])
      setShowSocialForm(false)
      setSocialForm({ title: '', description: '', num_courts: 1, date: '', start_time: '', end_time: '', max_players: 12, weeks: 1, price_cents: 0 })
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

  const openCancelSeriesModal = (recurrenceId) => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = socialSessions
      .filter(s => s.recurrence_id === recurrenceId && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    const selected = new Set()
    setCancelSeriesModal({ recurrenceId, sessions, selected })
  }

  const handleBatchCancel = async () => {
    if (!cancelSeriesModal) return
    const ids = [...cancelSeriesModal.selected]
    if (ids.length === 0) return
    try {
      await socialAPI.cancelBatch(ids)
      setSocialSessions(prev => prev.filter(s => !cancelSeriesModal.selected.has(s.id)))
      setCancelSeriesModal(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel sessions.')
    }
  }

  const handleSaveSocial = async (id) => {
    const edits = editingSocial[id]
    if (!edits) return
    try {
      const { data } = await socialAPI.updateSession(id, {
        title:       edits.title,
        date:        edits.date,
        start_time:  edits.start_time,
        end_time:    edits.end_time,
        max_players: Number(edits.max_players),
        price_cents: Math.max(0, Math.round(Number(edits.price_dollars ?? 0) * 100)),
      })
      setSocialSessions(prev => prev.map(s => s.id === id ? { ...s, ...data.session } : s))
      setEditingSocial(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update session.')
    }
  }

  const handleSaveSeriesEdit = async () => {
    if (!editingSeries) return
    setEditingSeries(prev => ({ ...prev, saving: true }))
    try {
      const priceCents = Math.max(0, Math.round(Number(editingSeries.price_dollars ?? 0) * 100))
      await socialAPI.updateSeries(editingSeries.rid, {
        title:       editingSeries.title,
        start_time:  editingSeries.start_time,
        end_time:    editingSeries.end_time,
        max_players: Number(editingSeries.max_players),
        price_cents: priceCents,
      })
      // Refresh all sessions in this series from local state
      setSocialSessions(prev => prev.map(s =>
        s.recurrence_id === editingSeries.rid
          ? { ...s, title: editingSeries.title, start_time: editingSeries.start_time, end_time: editingSeries.end_time, max_players: Number(editingSeries.max_players), price_cents: priceCents }
          : s
      ))
      setEditingSeries(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not update series.')
      setEditingSeries(prev => ({ ...prev, saving: false }))
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
      const allSkipped = []
      let totalCreated = 0
      for (const dow of days) {
        const startDate = nextOccurrence(date, dow)
        const times = mixed ? { start_time: dayTimes[dow].start_time, end_time: dayTimes[dow].end_time } : { start_time, end_time }
        const { data: created } = await coachingAPI.createSession({ ...sessionForm, ...times, date: startDate })
        totalCreated += created.sessions?.length ?? 0
        if (created.skipped?.length) allSkipped.push(...created.skipped)
      }
      if (allSkipped.length) {
        alert(`Sessions created. Note: ${allSkipped.length} date${allSkipped.length > 1 ? 's' : ''} were skipped because all courts were full:\n${allSkipped.join(', ')}`)
      }
      setShowSessionForm(false)
      setSessionSaved(false)
      setSessionForm({ coach_id: '', student_id: '', date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10 })
      setStudentSearch('')
      const [{ data }, { data: allData }] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getSessions({}),
      ])
      setCoachingSessions(data.sessions)
      setAdminCheckedIn(new Set(data.sessions.filter(s => s.checked_in).map(s => s.id)))
      setAllCoachingSessions(allData.sessions)
      try {
        const { data: hd } = await coachingAPI.getHoursBalance(student_id)
        setSessionStudentBalance(hd.balance)
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

  const refreshAll = async () => {
    await Promise.all([refreshAfterReschedule(), refreshBookingView()])
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
      await refreshAll()
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
      await refreshAll()
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
      await refreshAll()
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
        await coachingAPI.cancelSession(id)
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
      await refreshAll()
      setCalendarReschedule(null)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not reschedule.')
      setCalendarReschedule(prev => ({ ...prev, saving: false }))
    }
  }

  const handleCancelSession = (id, sessionObj = null) => {
    const session = sessionObj
      ?? allCoachingSessions.find(s => s.id === id)
      ?? coachingSessions.find(s => s.id === id)
      ?? bookingViewSessions.find(s => s.id === id)
    if (!session) return
    const series = session.recurrence_id
      ? allCoachingSessions.filter(s => s.recurrence_id === session.recurrence_id)
      : []
    const lastDate = (series.length ? series : [session])
      .map(s => s.date?.slice(0, 10)).filter(Boolean).sort().at(-1)
      ?? session.date?.slice(0, 10)
    const canMakeup = !session.checked_in
    setCancelModal({ session, lastDate, wantMakeup: canMakeup, submitting: false })
  }

  const handleConfirmCancelModal = async () => {
    if (!cancelModal) return
    const { session, wantMakeup } = cancelModal
    const snapshot = allCoachingSessions // capture before state updates
    setCancelModal(m => ({ ...m, submitting: true }))
    try {
      await coachingAPI.cancelSession(session.id)
      setCoachingSessions(prev => prev.filter(s => s.id !== session.id))
      setAllCoachingSessions(prev => prev.filter(s => s.id !== session.id))
      setBookingViewSessions(prev => prev.filter(s => s.id !== session.id))
      setMemberModal(prev => prev ? ({ ...prev, coaching: prev.coaching.filter(x => x.id !== session.id) }) : prev)
      setCancelModal(null)
      if (wantMakeup) {
        await offerMakeupSession(session, snapshot)
      }
    } catch {
      alert('Could not cancel session.')
      setCancelModal(null)
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
        await refreshAll()
      } catch (err) { alert(err.response?.data?.message ?? 'Could not move sessions.') }
      return
    }

    // Full cancel — no charge (leave/advance cancellation)
    try {
      for (const s of sessions) {
        await coachingAPI.cancelSession(s.id)
      }
      await refreshAll()
    } catch (err) { alert(err.response?.data?.message ?? 'Could not cancel sessions.') }
  }

  const handleCancelGroupSession = async (groupId) => {
    if (!window.confirm('Cancel all sessions in this group? No charge will be made (advance cancellation).')) return
    try {
      await coachingAPI.cancelGroupSession(groupId)
      setGroupSessions(prev => prev.filter(g => g.group_id !== groupId))
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not cancel group session.')
    }
  }

  const openTransferModal = async (params) => {
    setTransferModal({ ...params, balance: null, soloPrice: null, groupPrice: null, submitting: false, error: null })
    try {
      const [balRes, priceRes] = await Promise.all([
        coachingAPI.getHoursBalance(params.studentId),
        coachingAPI.getStudentPrices(params.studentId),
      ])
      const balance   = balRes.data.balance
      const soloPrice = priceRes.data.solo_price
      const groupPrice = priceRes.data.group_price
      const newPrice  = params.direction === 'to-solo' ? soloPrice : groupPrice
      const weeks     = balance > 0 && newPrice > 0 ? Math.max(1, Math.floor(balance / newPrice)) : 1
      setTransferModal(m => m && ({ ...m, balance, soloPrice, groupPrice, weeks }))
    } catch {
      setTransferModal(m => m && ({ ...m, error: 'Could not load student data.' }))
    }
  }

  const handleConfirmTransfer = async () => {
    if (!transferModal) return
    const { direction, studentId, groupId, recurrenceId, targetGroupId,
            coachId, startTime, endTime, fromDate, weeks, soloPrice, groupPrice } = transferModal
    setTransferModal(m => ({ ...m, submitting: true, error: null }))
    try {
      // 1. Save student prices
      await coachingAPI.updateStudentPrices(studentId, { solo_price: soloPrice, group_price: groupPrice })
      if (direction === 'to-solo') {
        // 2a. Remove from group
        await coachingAPI.removeStudentFromGroup(groupId, studentId, fromDate)
        // 3a. Create solo series
        await coachingAPI.createSession({ coach_id: coachId, student_id: studentId, date: fromDate, start_time: startTime, end_time: endTime, weeks })
      } else {
        // 2b. Cancel solo recurrence
        await coachingAPI.cancelRecurrence(recurrenceId)
        // 3b. Add to group
        await coachingAPI.addStudentToGroup(targetGroupId, studentId, fromDate)
      }
      // Reload
      const [sd, gd] = await Promise.all([
        coachingAPI.getSessions({ date: coachingDate }),
        coachingAPI.getGroupSessions({ date: coachingDate }),
      ])
      setCoachingSessions(sd.data.sessions)
      setGroupSessions(gd.data.groups)
      setTransferModal(null)
    } catch (err) {
      setTransferModal(m => ({ ...m, submitting: false, error: err.response?.data?.message ?? 'Transfer failed.' }))
    }
  }

  const handleAddStudentToGroup = async (groupId, studentId) => {
    setAddStudentSaving(true)
    try {
      const { data } = await coachingAPI.addStudentToGroup(groupId, studentId)
      const { data: gd } = await coachingAPI.getGroupSessions({ date: coachingDate })
      setGroupSessions(gd.groups)
      await refreshAll()
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
      await coachingAPI.addStudentToGroup(groupEditModal.group_id, studentId)
      await refreshAll()
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
      await coachingAPI.removeStudentFromGroup(groupEditModal.group_id, studentId)
      await refreshAll()
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
      await coachingAPI.addStudentToGroup(groupEditModal.group_id, studentId, fromDate)
      setDateAddSearch(prev => { const n = { ...prev }; delete n[fromDate]; return n })
      await refreshAll()
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
      await coachingAPI.removeStudentFromGroup(groupEditModal.group_id, studentId, fromDate)
      await refreshAll()
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
      await refreshAll()
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
      await refreshAll()
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
        for (const s of (dateMap[date] ?? [])) {
          await coachingAPI.cancelSession(s.id)
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
      await refreshAll()
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
      await refreshAll()
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
      await refreshAll()
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
    <div className="page-wrapper py-8 px-4 pb-28 max-w-7xl mx-auto">


      {/* Today's coaching — per-coach session count with hover tooltip */}
      {todayCoachSummary.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-gray-800 uppercase tracking-widest mb-3">
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
                  <p className="text-xs text-gray-800 mt-0.5 truncate max-w-[120px]">{coach.name}</p>
                  <p className="text-[10px] text-gray-800">
                    session{coach.sessions.length !== 1 ? 's' : ''} today
                  </p>
                </div>
                {/* Hover tooltip */}
                <div className="absolute left-0 top-full mt-1.5 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-64 card shadow-xl pointer-events-none">
                  <p className="text-[10px] text-gray-800 uppercase tracking-widest mb-2">Schedule</p>
                  <div className="space-y-1.5">
                    {coach.sessions.map(s => (
                      <div key={s.id} className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-800">{s.student_name}</span>
                        <span className="text-xs font-mono text-gray-800">
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

      {/* Tabs — desktop only */}
      <div className="hidden lg:flex border-b border-gray-200 mb-6 gap-1">
        {tabOrder.map((tabIdx, displayIdx) => {
          const tab = TABS[tabIdx]
          const isActive   = activeTab === tab
          const isDragOver = dragTabOverIdx === displayIdx && dragTabIdx !== displayIdx
          return (
            <button
              key={tab}
              draggable
              onDragStart={e => handleTabDragStart(e, displayIdx)}
              onDragOver={e => handleTabDragOver(e, displayIdx)}
              onDrop={e => handleTabDrop(e, displayIdx)}
              onDragEnd={handleTabDragEnd}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all select-none cursor-pointer ${
                isActive
                  ? 'border-black text-black'
                  : isDragOver
                    ? 'border-gray-400 text-gray-600 opacity-50'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
              } ${dragTabIdx === displayIdx ? 'opacity-40' : ''}`}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* Mobile tab label */}
      <div className="lg:hidden mb-4">
        <p className="text-xs uppercase tracking-widest text-gray-500">{activeTab}</p>
      </div>

      {/* ── Fixed bottom nav — mobile only (rendered via portal to avoid z-index trapping) ── */}
      {createPortal(
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[9999] bg-white border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] safe-area-pb">
        {/* More drawer */}
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute bottom-full inset-x-0 bg-white border-t border-gray-200 shadow-2xl z-40">
              <div className="grid grid-cols-4 divide-x divide-gray-100">
                {['Analytics', 'QR-Code', 'Shop', 'Articles'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setShowMoreMenu(false) }}
                    className={`py-5 flex flex-col items-center gap-1 text-[11px] tracking-wide transition-colors ${
                      activeTab === tab ? 'text-black font-semibold bg-gray-50' : 'text-gray-500'
                    }`}
                  >
                    {tab === 'Analytics' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm9.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm-9.75 4.5a1.125 1.125 0 00-1.125 1.125v4.5c0 .621.504 1.125 1.125 1.125h2.25c.621 0 1.125-.504 1.125-1.125v-4.5a1.125 1.125 0 00-1.125-1.125H3z" />
                      </svg>
                    )}
                    {tab === 'QR-Code' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                      </svg>
                    )}
                    {tab === 'Shop' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    )}
                    {tab === 'Articles' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
                      </svg>
                    )}
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-5 h-20">
          {/* Bookings */}
          <button
            onClick={() => { setActiveTab('Bookings'); setShowMoreMenu(false) }}
            className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${activeTab === 'Bookings' ? 'text-black' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-[11px] font-medium tracking-wide">Bookings</span>
          </button>

          {/* Coaching */}
          <button
            onClick={() => { setActiveTab('Coaching'); setShowMoreMenu(false) }}
            className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${activeTab === 'Coaching' ? 'text-black' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
            <span className="text-[11px] font-medium tracking-wide">Coaching</span>
          </button>

          {/* Social Play */}
          <button
            onClick={() => { setActiveTab('Social Play'); setShowMoreMenu(false) }}
            className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${activeTab === 'Social Play' ? 'text-black' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <span className="text-[11px] font-medium tracking-wide">Social</span>
          </button>

          {/* Members */}
          <button
            onClick={() => { setActiveTab('Members'); setShowMoreMenu(false) }}
            className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${activeTab === 'Members' ? 'text-black' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-[11px] font-medium tracking-wide">Members</span>
          </button>

          {/* More */}
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${['Analytics','QR-Code','Shop','Articles'].includes(activeTab) ? 'text-black' : showMoreMenu ? 'text-black' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span className="text-[11px] font-medium tracking-wide">More</span>
          </button>
        </div>
      </nav>,
      document.body
      )}

      {/* ── Today tab (hidden) ───────────────────────────────────────────── */}
      {false && (
        <div className="animate-fade-in space-y-6">
          {todayLoading ? (
            <p className="text-gray-800 text-sm">Loading today's schedule…</p>
          ) : todayError ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-red-400 text-sm">{todayError}</p>
              <button onClick={loadTodaySummary} className="btn-primary text-sm">Retry</button>
            </div>
          ) : !todaySummary ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-gray-800 text-sm">No data loaded.</p>
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
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Checked in</span>
                  <button
                    onClick={() => handleUndoCheckIn(type, refId, userId)}
                    className="text-[10px] text-gray-800 hover:text-red-400 font-medium transition-colors"
                    title="Undo check-in"
                  >✕</button>
                </span>
              )
              : <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">Not in</span>

            return (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <p className="text-gray-800 text-sm">{todayLabel}</p>
                    <input
                      type="date"
                      max={todayStr}
                      value={todayDate}
                      onChange={e => { setTodayDate(e.target.value); setTodaySummary(null) }}
                      className="input text-xs py-1 px-2"
                    />
                  </div>
                  <button onClick={() => loadTodaySummary(todayDate)} className="text-xs text-gray-800 hover:text-gray-900 transition-colors">↺ Refresh</button>
                </div>
                {isFuture && (
                  <p className="text-amber-400 text-xs">Future date selected — check-in is not available.</p>
                )}

                {noActivity && (
                  <p className="text-gray-800 text-sm">No activities scheduled for this date.</p>
                )}

                {/* ── Bookings ──────────────────────────────────────── */}
                {Object.keys(bookingGroups).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-800 uppercase tracking-widest mb-3">Court Bookings</p>
                    <div className="space-y-3">
                      {Object.values(bookingGroups).map(g => (
                        <div key={g.group_id + g.start_time} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-mono text-gray-800">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</span>
                            <span className="text-xs text-gray-800">{g.court_name}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {g.members.map(m => (
                              <div key={m.user_id} className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5">
                                <span className="text-xs text-gray-900">{m.user_name}</span>
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
                      <p className="text-xs text-gray-800 uppercase tracking-widest mb-3">Coaching Sessions</p>
                      <div className="space-y-5">
                        {coachEntries.map(coach => (
                          <div key={coach.coach_name}>
                            <p className="text-sm text-gray-900 mb-2 px-1">{coach.coach_name}</p>
                            <div className="space-y-2">
                              {coach.sessions.sort((a, b) => a.data.start_time < b.data.start_time ? -1 : 1).map(({ type, data: c }) => (
                                <div key={type === 'solo' ? c.id : c.group_id} className="card py-3 px-4">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-xs font-mono text-gray-800">{fmtTime(c.start_time)} – {fmtTime(c.end_time)}</span>
                                    <span className="text-xs text-gray-800">{c.court_name}</span>
                                    {type === 'group' && <span className="text-[10px] bg-teal-500/15 text-teal-600 px-2 py-0.5 rounded-full">Group</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {type === 'solo' ? (
                                      <>
                                        <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5">
                                          {c.admin_checked_in ? (
                                            <button onClick={() => handleUndoCheckIn('coaching', c.id, c.student_id)} className="text-xs text-sky-400 hover:text-red-400 transition-colors" title="Undo check-in">✓ {c.student_name}</button>
                                          ) : !isFuture ? (
                                            <button onClick={() => handleCheckIn('coaching', c.id, c.student_id)} className="text-xs text-gray-900 hover:text-emerald-600 transition-colors" title="Check in">{c.student_name}</button>
                                          ) : (
                                            <span className="text-xs text-gray-900">{c.student_name}</span>
                                          )}
                                          <span className="text-[10px] text-gray-500">student</span>
                                        </div>
                                        {/* Coach feedback & student rating (past sessions only) */}
                                        {!isFuture && (c.review_body || (c.review_skills?.length > 0) || c.student_rating) && (
                                          <div className="w-full mt-1 space-y-1.5">
                                            {(c.review_body || c.review_skills?.length > 0) && (
                                              <div className="bg-sky-50 rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Coach feedback</p>
                                                {c.review_skills?.length > 0 && (
                                                  <div className="flex flex-wrap gap-1 mb-1">
                                                    {c.review_skills.map(k => (
                                                      <span key={k} className="text-[10px] bg-white border border-sky-200 px-1.5 py-0.5 rounded-full text-gray-600">{k}</span>
                                                    ))}
                                                  </div>
                                                )}
                                                {c.review_body && <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.review_body}</p>}
                                              </div>
                                            )}
                                            {c.student_rating && (
                                              <div className="bg-amber-50 rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Student rating</p>
                                                <div className="flex items-center gap-0.5">
                                                  {[1,2,3,4,5].map(n => (
                                                    <span key={n} className={`text-sm ${n <= c.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                                                  ))}
                                                </div>
                                                {c.student_comment && <p className="text-xs text-gray-600 mt-0.5 italic">"{c.student_comment}"</p>}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      c.students.map(s => (
                                        <div key={s.student_id} className="flex items-center gap-1.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5">
                                          {s.admin_checked_in ? (
                                            <button onClick={() => handleUndoCheckIn('coaching', s.id, s.student_id)} className="text-xs text-sky-400 hover:text-red-400 transition-colors" title="Undo check-in">✓ {s.student_name}</button>
                                          ) : !isFuture ? (
                                            <button onClick={() => handleCheckIn('coaching', s.id, s.student_id)} className="text-xs text-gray-900 hover:text-emerald-600 transition-colors" title="Check in">{s.student_name}</button>
                                          ) : (
                                            <span className="text-xs text-gray-900">{s.student_name}</span>
                                          )}
                                          <span className="text-[10px] text-gray-500">student</span>
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
                    <p className="text-xs text-gray-800 uppercase tracking-widest mb-3">Social Play</p>
                    <div className="space-y-3">
                      {Object.values(socialGroups).map(g => (
                        <div key={g.id} className="card py-3 px-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-gray-900 text-sm">{g.title}</span>
                            <span className="text-xs font-mono text-gray-800">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {g.members.map(m => (
                              <div key={m.user_id} className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5">
                                <span className="text-xs text-gray-900">{m.user_name}</span>
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
              <h3 className="text-sm font-normal text-gray-900 mb-4">Add Member</h3>
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
          <div className="px-4 py-3 border-b border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              type="text"
              className="input flex-1 text-sm"
              placeholder="Search by name or email…"
              value={memberListSearch}
              onChange={e => setMemberListSearch(e.target.value)}
            />
            {!showAddMember && (
              <button className="btn-primary text-sm w-full sm:w-auto" onClick={() => setShowAddMember(true)}>
                + Add Member
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-gray-800 text-sm p-5">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-gray-800 text-sm p-5">No members found.</p>
          ) : (() => {
            const ROLE_ORDER = { admin: 0, coach: 1, member: 2 }
            const s = memberListSearch.toLowerCase().trim()
            const filtered = members
              .filter(m => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3))
            return filtered.length === 0 ? (
              <p className="text-gray-800 text-sm p-5">No members match your search.</p>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="sticky top-0 bg-gray-100 text-left px-5 py-3 text-xs text-gray-700 font-semibold uppercase tracking-wider border-b border-gray-300 z-10">{h}</th>
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
                          <tr className={`border-b border-gray-300 ${isCoachExpanded ? '' : 'last:border-0'} hover:bg-gray-100 transition-colors`}>
                            <td className="px-5 py-3 font-medium w-[20%]">
                              {editingMember?.id === m.id ? (
                                <input
                                  className="input text-xs py-1 w-full"
                                  value={editingMember.name}
                                  onChange={e => setEditingMember(prev => ({ ...prev, name: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveMemberEdit(); if (e.key === 'Escape') setEditingMember(null) }}
                                  autoFocus
                                />
                              ) : coachRec ? (
                                <button
                                  onClick={() => { setCoachViewModal({ coach_id: coachRec.id, coach_name: m.name, email: coachRec.email, phone: coachRec.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                  className="text-left text-gray-900 hover:text-blue-600 transition-colors font-medium">
                                  {m.name}
                                </button>
                              ) : (
                                <button onClick={() => handleOpenMemberModal(m.id)} className="text-gray-900 hover:text-blue-600 transition-colors text-left font-medium">{m.name}</button>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-800 w-[30%]">
                              {editingMember?.id === m.id ? (
                                <input
                                  className="input text-xs py-1 w-full"
                                  type="email"
                                  value={editingMember.email}
                                  onChange={e => setEditingMember(prev => ({ ...prev, email: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveMemberEdit(); if (e.key === 'Escape') setEditingMember(null) }}
                                />
                              ) : m.email}
                            </td>
                            <td className="px-5 py-3 w-[15%]">
                              <span className={`badge border rounded-full ${
                                m.role === 'admin' ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : m.role === 'coach' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-gray-800 w-[20%]">{fmtDate(m.created_at)}</td>
                            <td className="px-5 py-3 w-[15%]">
                              <div className="flex gap-3 flex-wrap">
                                {editingMember?.id === m.id ? (
                                  <>
                                    <button onClick={handleSaveMemberEdit} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Save</button>
                                    <button onClick={() => setEditingMember(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => setEditingMember({ id: m.id, name: m.name, email: m.email })} className="text-xs text-amber-600 hover:text-amber-800 font-medium">Edit</button>
                                    {m.role === 'admin' ? (
                                      <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Demote</button>
                                    ) : m.role === 'coach' ? (
                                      <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Demote</button>
                                    ) : (
                                      <>
                                        <button onClick={() => handleRoleToggle(m.id, m.role, m.name)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Make Admin</button>
                                        <button onClick={() => { setCoachModal({ id: m.id, name: m.name }); setCoachForm({ availability_start: '', availability_end: '', bio: '', resume: null }) }} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Make Coach</button>
                                      </>
                                    )}
                                    <button onClick={() => handleRemoveMember(m.id, m.name, m.role)} className="text-xs text-red-600 hover:text-red-800 font-medium">Remove</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Inline coach expansion — student list */}
                          {isCoachExpanded && (
                            <tr className="border-b border-gray-300 bg-gray-100/10">
                              <td colSpan={5} className="px-6 py-3">
                                {coachStudents.length === 0 ? (
                                  <p className="text-gray-800 text-xs py-1">No sessions found for this coach.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {coachStudents.map(({ student_id, student_name, sessions }) => {
                                      const isStudentExpanded = coachRowExpanded.has(student_id)
                                      const sorted = [...sessions].sort((a, b) => a.date < b.date ? -1 : 1)
                                      const upcoming = sorted.filter(s => s.date?.slice(0, 10) >= todayISO)
                                      const past = sorted.filter(s => s.date?.slice(0, 10) < todayISO)
                                      return (
                                        <div key={student_id} className={`rounded-lg border ${isStudentExpanded ? 'border-gray-200 bg-court' : 'border-transparent'}`}>
                                          <button
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                                            onClick={() => setCoachRowExpanded(prev => {
                                              const n = new Set(prev)
                                              isStudentExpanded ? n.delete(student_id) : n.add(student_id)
                                              return n
                                            })}>
                                            <span className="font-medium text-gray-900 text-sm">{student_name}</span>
                                            <div className="flex items-center gap-3">
                                              <span className="text-xs text-gray-800">{upcoming.length} upcoming · {past.length} past</span>
                                              <span className="text-gray-800 text-xs">{isStudentExpanded ? '▲' : '▼'}</span>
                                            </div>
                                          </button>
                                          {isStudentExpanded && (
                                            <div className="border-t border-gray-200/40 px-4 pb-3 pt-2 space-y-1">
                                              {sorted.map(s => {
                                                const isPast = s.date?.slice(0, 10) < todayISO
                                                const checkedIn = s.checked_in || adminCheckedIn.has(s.id)
                                                return (
                                                  <div key={s.id} className="flex items-center gap-2 py-1">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${s.group_id ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                      {s.group_id ? 'Group' : '1-on-1'}
                                                    </span>
                                                    <span className={`text-sm flex-1 ${isPast ? 'text-gray-800' : 'text-gray-900'}`}>{fmtDate(s.date)}</span>
                                                    <span className="text-xs text-gray-800 font-mono">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                                                    {isPast
                                                      ? checkedIn
                                                        ? <span className="text-emerald-600 text-xs font-medium shrink-0">✓ In</span>
                                                        : <span className="text-gray-500 text-xs shrink-0">— No show</span>
                                                      : checkedIn
                                                        ? <span className="text-emerald-600 text-xs font-medium shrink-0">✓ In</span>
                                                        : <span className="text-blue-600 text-xs shrink-0">Upcoming</span>
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
                  className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all text-center min-w-[72px] ${
                    selectedDate === iso
                      ? 'bg-black border-black text-white'
                      : 'border-gray-300 text-gray-700 hover:border-black hover:text-black'
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
          <div className="card p-0 overflow-x-auto">
            {loading ? (
              <p className="text-gray-800 text-sm p-5">Loading schedule…</p>
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
                <div className="flex min-w-[640px]">
                  {/* Left: time axis + free-court count */}
                  <div className="flex-shrink-0 w-28 border-r border-gray-200">
                    {slotsForDay.map(slot => {
                      const free      = countFreeAtSlot(bookings, bookingViewSessions, bookingViewSocialSessions, slot)
                      const freeColor = free === 0 ? 'text-red-600' : free <= 2 ? 'text-amber-600' : 'text-emerald-600'
                      return (
                        <div
                          key={slot}
                          style={{ height: SLOT_H }}
                          className="flex items-start pt-2.5 px-3 border-b border-gray-200/30 last:border-0 gap-1"
                        >
                          <span className="text-[11px] text-gray-800 font-mono leading-none">{fmtTime(slot)}</span>
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
                        className="absolute w-full border-t border-gray-200/20"
                        style={{ top: i * SLOT_H }}
                      />
                    ))}

                    {laid.length === 0 && (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-800">
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
                            className="bg-blue-100 border border-blue-400 rounded-xl px-2.5 py-1.5 overflow-hidden flex flex-col"
                          >
                            <p className="text-blue-900 text-xs leading-tight font-medium break-words">{ev.user_name}</p>
                            <p className="text-blue-700 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-between gap-1">
                              {checkedIn ? (
                                <button
                                  onClick={() => handleAdminUndoCheckIn('booking', ev.booking_group_id, ev.user_id)}
                                  className="text-xs text-emerald-600 hover:text-red-600 leading-none transition-colors"
                                  title="Undo check-in"
                                >✓ In</button>
                              ) : (
                                <button
                                  onClick={() => handleAdminCheckIn('booking', ev.booking_group_id, ev.user_id)}
                                  className="px-2 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-medium leading-none"
                                >
                                  ✓ In
                                </button>
                              )}
                              <div className="flex items-center gap-1">
                                {!checkedIn && ev.payment_intent_id && (
                                  <button
                                    onClick={() => handleBookingNoShow(ev.payment_intent_id)}
                                    className="text-[10px] text-amber-600 hover:text-amber-800 leading-none"
                                    title="Charge no-show fee"
                                  >NS</button>
                                )}
                                <button
                                  onClick={() => handleCancelBooking(ev.booking_group_id)}
                                  className="text-xs text-red-600 hover:text-red-800 leading-none"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      }

                      if (ev.type === 'coaching') {
                        const ciRecord = adminCheckIns.find(
                          ci => ci.type === 'coaching' && ci.reference_id === String(ev.id) && ci.user_id === ev.student_id
                        )
                        const checkedIn = !!ciRecord
                        const isNoShow  = ciRecord?.no_show === true
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height, left, width }}
                            className="bg-emerald-100 border border-emerald-400 rounded-xl px-2.5 py-1.5 flex flex-col overflow-hidden"
                          >
                            <p className={`text-xs leading-tight font-medium break-words ${isNoShow ? 'text-red-500 line-through' : 'text-emerald-900'}`}>{ev.student_name}</p>
                            <p className="text-emerald-700 text-xs mt-0.5 leading-tight">Coach: {ev.coach_name}</p>
                            <p className="text-emerald-700 text-xs mt-0.5 leading-tight">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center gap-2 pt-1">
                              {checkedIn && (
                                <span className={`text-[10px] font-medium ${isNoShow ? 'text-red-400' : 'text-emerald-600'}`}>
                                  {isNoShow ? '✗ NS' : '✓ In'}
                                </span>
                              )}
                              <button onClick={() => setCalendarReschedule({ type: 'solo', ev, newDate: selectedDate, newStart: ev.start_time.slice(0,5), newEnd: ev.end_time.slice(0,5), saving: false, _slots: openTimeSlots })} className="text-xs text-blue-600 hover:text-blue-800 leading-none">Edit</button>
                              <button onClick={() => handleCancelSession(ev.id)} className="text-xs text-red-600 hover:text-red-800 leading-none">Cancel</button>
                            </div>
                          </div>
                        )
                      }

                      if (ev.type === 'coaching_group') {
                        return (
                          <div
                            key={ev.key}
                            style={{ position: 'absolute', top, height, left, width }}
                            className="bg-teal-100 border border-teal-400 rounded-xl px-2.5 py-1.5 flex flex-col overflow-hidden"
                          >
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {ev.student_names.map((name, i) => {
                                const sid       = ev.student_ids[i]
                                const sessionId = ev.session_ids[i]
                                const ciRecord  = adminCheckIns.find(
                                  ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === sid
                                )
                                const ciIn     = !!ciRecord
                                const isNoShow = ciRecord?.no_show === true
                                return (
                                  <div key={i} className="flex items-center gap-1">
                                    <span className={`text-xs leading-tight font-medium break-words ${isNoShow ? 'text-red-400 line-through' : 'text-teal-900'}`}>{name}</span>
                                    {ciIn && (
                                      <span className={`text-[10px] font-medium ${isNoShow ? 'text-red-400' : 'text-emerald-600'}`}>{isNoShow ? '✗' : '✓'}</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <p className="text-teal-700 text-xs mt-0.5 leading-none">Coach: {ev.coach_name}</p>
                            <p className="text-teal-700 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                            <div className="mt-auto flex items-center justify-end gap-1">
                              <button
                                onClick={() => setCalendarReschedule({ type: 'group', ev, newDate: selectedDate, newStart: ev.start_time.slice(0,5), newEnd: ev.end_time.slice(0,5), saving: false, _slots: openTimeSlots })}
                                className="text-xs text-blue-600 hover:text-blue-800 leading-none"
                              >Edit</button>
                              <button
                                onClick={() => handleCancelTodayGroupSession(ev)}
                                className="text-xs text-red-600 hover:text-red-800 leading-none"
                              >Cancel</button>
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
                          className="bg-violet-100 border border-violet-400 rounded-xl px-2.5 py-1.5 overflow-hidden flex flex-col"
                        >
                          <p className="text-violet-900 text-xs truncate leading-none font-medium">{ev.title}</p>
                          <p className="text-violet-700 text-xs mt-1 leading-none">{ev.num_courts} court{ev.num_courts !== 1 ? 's' : ''}</p>
                          <p className="text-violet-700 text-xs mt-0.5 leading-none">{ev.participant_count}/{ev.max_players} players</p>
                          <p className="text-violet-700 text-xs mt-0.5 leading-none">{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</p>
                          {socialCheckinCount > 0 && (
                            <p className="text-xs text-emerald-600 mt-0.5 leading-none">✓ {socialCheckinCount} checked in</p>
                          )}
                          <div className="mt-auto flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSocialCalendarEdit({ id: ev.id, title: ev.title, num_courts: ev.num_courts, max_players: ev.max_players, date: ev.date, start_time: ev.start_time.slice(0,5), end_time: ev.end_time.slice(0,5), saving: false })}
                              className="text-xs text-blue-600 hover:text-blue-800 leading-none"
                            >Edit</button>
                            <button
                              onClick={() => handleCancelSocialSession(ev.id)}
                              className="text-xs text-red-600 hover:text-red-800 leading-none"
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

          {/* ── Sub-tab bar ── */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {[['Sessions', 'one-on-one'], ['Hours', 'hours'], ['Reviews', 'reviews']].map(([label, key]) => (
              <button key={key} onClick={() => setCoachingSubTab(key)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${coachingSubTab === key ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Date picker (sessions only) ── */}
          {coachingSubTab !== 'hours' && coachingSubTab !== 'reviews' && (
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
                        ? 'bg-brand-500 border-brand-500 text-gray-900'
                        : hasMatch
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 hover:border-emerald-400 hover:text-gray-900'
                          : 'border-gray-200 text-gray-800 hover:border-brand-500/50 hover:text-gray-900'
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
              <button
                onClick={() => { setShowSessionForm(v => { if (!v) { setSessionForm({ coach_id: '', student_id: '', date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10 }); setGroupForm({ coach_id: '', student_ids: [], date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10 }); setStudentSearch(''); setGroupStudentSearch('') } return !v }); setShowGroupForm(false); setSessionSaved(false) }}
                className="btn-primary text-sm flex-shrink-0 ml-auto"
              >
                {showSessionForm ? 'Cancel' : '+ Schedule Session'}
              </button>
            </div>
          )}

          {/* ══════════ COMBINED SESSION FORM (one-on-one + group) ══════════ */}
          {coachingSubTab !== 'hours' && showSessionForm && (() => {
            const isGroup = coachingSubTab === 'group'
            const activeForm = isGroup ? groupForm : sessionForm
            const setActiveForm = isGroup ? setGroupForm : setSessionForm
            const formDow = activeForm.date ? new Date(activeForm.date + 'T12:00:00').getDay() : null
            const effectiveDows = activeForm.selectedDays.length ? activeForm.selectedDays : (formDow != null ? [formDow] : [])
            const hasSat = effectiveDows.includes(6)
            const hasWkd = effectiveDows.some(d => d !== 6)
            const formSlots = hasSat && hasWkd ? ALL_SLOTS : hasSat ? SATURDAY_SLOTS : WEEKDAY_SLOTS
            const formClosing = slotClosing(formSlots)
            const endSlots = [...formSlots, formClosing].filter(s => !activeForm.start_time || toMins(s) > toMins(activeForm.start_time))
            const selectedStudents = isGroup ? members.filter(m => groupForm.student_ids.includes(m.id)) : []
            const filteredStudents = isGroup && groupStudentSearch
              ? members.filter(m => !groupForm.student_ids.includes(m.id) && (m.name.toLowerCase().includes(groupStudentSearch.toLowerCase()) || m.email.toLowerCase().includes(groupStudentSearch.toLowerCase())))
              : []
            return (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm mb-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-widest">Schedule Coaching Session</h3>
                  <button onClick={() => { setShowSessionForm(false); setSessionSaved(false); setSessionForm({ coach_id: '', student_id: '', date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10 }); setGroupForm({ coach_id: '', student_ids: [], date: '', selectedDays: [], start_time: '', end_time: '', dayTimes: {}, notes: '', weeks: 10 }); setStudentSearch(''); setGroupStudentSearch('') }} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">✕</button>
                </div>

                {/* Type toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                  <button onClick={() => setCoachingSubTab('one-on-one')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${!isGroup ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                    1-on-1
                  </button>
                  <button onClick={() => setCoachingSubTab('group')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${isGroup ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                    Group
                  </button>
                </div>
                {isGroup && <p className="text-xs text-gray-500">Assign 2–5 students to one coach. They share a single court.</p>}

                {/* Success banner */}
                {sessionSaved && !isGroup && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
                    Session scheduled! Student/coach kept — pick another day to add a second session this week.
                  </div>
                )}

                {/* Coach */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Coach</label>
                  <select className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 bg-white focus:outline-none focus:border-black transition-colors"
                    value={activeForm.coach_id} onChange={e => setActiveForm(f => ({ ...f, coach_id: e.target.value }))}>
                    <option value="">Select coach…</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Student(s) */}
                {!isGroup ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Student</label>
                    <input type="text" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
                      placeholder="Search student name…" value={studentSearch}
                      onChange={e => { setStudentSearch(e.target.value); setSessionForm(f => ({ ...f, student_id: '' })); setSessionStudentBalance(null) }}
                    />
                    {studentSearch && (
                      <div className="mt-1 border border-gray-200 rounded-xl overflow-y-auto max-h-[160px] bg-white shadow-sm">
                        {members.filter(m => m.name.toLowerCase().includes(studentSearch.toLowerCase()) || m.email.toLowerCase().includes(studentSearch.toLowerCase())).map(m => (
                          <button key={m.id} type="button"
                            onClick={async () => {
                              setSessionForm(f => ({ ...f, student_id: String(m.id) }))
                              setStudentSearch(m.name)
                              try { const { data } = await coachingAPI.getHoursBalance(m.id); setSessionStudentBalance(data.balance) } catch { setSessionStudentBalance(null) }
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${String(sessionForm.student_id) === String(m.id) ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-700'}`}>
                            {m.name}<span className="text-gray-400 text-xs ml-2">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {sessionStudentBalance !== null && (
                      <p className={`text-xs mt-1 ${sessionStudentBalance > 0 ? 'text-emerald-600' : 'text-red-600'}`}>Balance: ${sessionStudentBalance.toFixed(2)}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Students ({selectedStudents.length}/5)</label>
                    {selectedStudents.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedStudents.map(m => (
                          <span key={m.id} className="flex items-center gap-1 bg-gray-100 border border-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full">
                            {m.name}
                            <button type="button" onClick={() => { setGroupForm(f => ({ ...f, student_ids: f.student_ids.filter(id => id !== m.id) })); setGroupStudentBalances(b => { const n = { ...b }; delete n[m.id]; return n }) }}
                              className="ml-1 text-gray-400 hover:text-gray-700 leading-none">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedStudents.length < 5 && (
                      <input type="text" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
                        placeholder="Search to add a student…" value={groupStudentSearch} onChange={e => setGroupStudentSearch(e.target.value)} />
                    )}
                    {filteredStudents.length > 0 && (
                      <div className="mt-1 border border-gray-200 rounded-xl overflow-y-auto max-h-[160px] bg-white shadow-sm">
                        {filteredStudents.map(m => (
                          <button key={m.id} type="button"
                            onClick={async () => { setGroupForm(f => ({ ...f, student_ids: [...f.student_ids, m.id] })); setGroupStudentSearch(''); try { const { data } = await coachingAPI.getHoursBalance(m.id); setGroupStudentBalances(b => ({ ...b, [m.id]: data.balance })) } catch {} }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                            {m.name}<span className="text-gray-400 text-xs ml-2">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Starting week */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Starting week</label>
                  <input type="date" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-black transition-colors"
                    value={activeForm.date} onChange={e => setActiveForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                </div>

                {/* Days of week */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Days of week</label>
                  <div className="flex gap-2 flex-wrap">
                    {[{dow:1,label:'Mon'},{dow:2,label:'Tue'},{dow:3,label:'Wed'},{dow:6,label:'Sat'}].map(({dow,label}) => {
                      const active = activeForm.selectedDays.includes(dow)
                      return (
                        <button key={dow} type="button"
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-600'}`}
                          onClick={() => setActiveForm(f => ({ ...f, selectedDays: active ? f.selectedDays.filter(d => d !== dow) : [...f.selectedDays, dow] }))}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">Leave all unselected to use the starting-week date as-is.</p>
                </div>

                {/* Times */}
                {effectiveDows.length > 1 ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Times per day</label>
                    {effectiveDows.map(dow => {
                      const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]
                      const slots = dow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                      const dt = activeForm.dayTimes[dow] || { start_time: '', end_time: '' }
                      const eSlots = [...slots, slotClosing(slots)].filter(s => !dt.start_time || toMins(s) > toMins(dt.start_time))
                      return (
                        <div key={dow} className="flex gap-2 items-center">
                          <span className="text-sm text-gray-600 w-8">{dayLabel}</span>
                          <select className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 flex-1 focus:outline-none focus:border-black bg-white" value={dt.start_time}
                            onChange={e => { const s = e.target.value; const autoEnd = slots.find(t => toMins(t) === toMins(s) + 60) ?? ''; setActiveForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { start_time: s, end_time: autoEnd } } })) }}>
                            <option value="">Start…</option>
                            {slots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                          </select>
                          <select className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 flex-1 focus:outline-none focus:border-black bg-white" value={dt.end_time}
                            onChange={e => setActiveForm(f => ({ ...f, dayTimes: { ...f.dayTimes, [dow]: { ...dt, end_time: e.target.value } } }))} disabled={!dt.start_time}>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
                      <select className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 bg-white focus:outline-none focus:border-black"
                        value={activeForm.start_time}
                        onChange={e => { const s = e.target.value; const autoEnd = formSlots.find(t => toMins(t) === toMins(s) + 60) ?? ''; setActiveForm(f => ({ ...f, start_time: s, end_time: autoEnd })) }}>
                        <option value="">Select…</option>
                        {formSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
                      <select className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 bg-white focus:outline-none focus:border-black"
                        value={activeForm.end_time} onChange={e => setActiveForm(f => ({ ...f, end_time: e.target.value }))} disabled={!activeForm.start_time}>
                        <option value="">Select…</option>
                        {endSlots.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Weeks */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Weeks (1 = one-off)</label>
                  <input type="number" min={1} max={52} className="w-24 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-black"
                    value={activeForm.weeks} onChange={e => setActiveForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <textarea className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black resize-none h-20"
                    placeholder="e.g. Focus on backhand technique" value={activeForm.notes}
                    onChange={e => setActiveForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                {/* Hours preview */}
                {activeForm.start_time && activeForm.end_time && (() => {
                  const hrsPerSession = (toMins(activeForm.end_time) - toMins(activeForm.start_time)) / 60
                  const numDays = activeForm.selectedDays.length || 1
                  const total = hrsPerSession * activeForm.weeks * numDays
                  return (
                    <p className="text-sm text-gray-600">
                      Will credit <span className="font-semibold text-gray-900">{total.toFixed(1)} hrs</span> to {isGroup ? 'each student' : 'student'}
                      {' '}({hrsPerSession.toFixed(1)} hr × {activeForm.weeks} wk{activeForm.weeks > 1 ? 's' : ''}{numDays > 1 ? ` × ${numDays} days` : ''}). Deducted on attendance.
                    </p>
                  )
                })()}

                {/* Submit */}
                <button
                  onClick={isGroup ? handleCreateGroupSession : handleCreateSession}
                  disabled={isGroup && groupForm.student_ids.length < 2}
                  className="w-full bg-black hover:bg-gray-800 text-white rounded-xl py-3 text-sm font-medium tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {(() => {
                    const numDays = activeForm.selectedDays.length || 1
                    const total = activeForm.weeks * numDays
                    return `Create ${isGroup ? 'Group ' : ''}Session${total > 1 ? ` (${total} sessions)` : ''}`
                  })()}
                </button>
              </div>
            )
          })()}

          {/* ══════════ COMBINED COACHING SESSIONS ══════════ */}
          {coachingSubTab !== 'hours' && coachingSubTab !== 'reviews' && (
            <div className="space-y-4">
              {/* Search */}
              <input type="text" placeholder="Search by student or coach name…"
                value={coachingSearch} onChange={e => setCoachingSearch(e.target.value)}
                className="input text-sm w-full max-w-sm"
              />

              {loading ? (
                <p className="text-gray-800 text-sm">Loading sessions…</p>
              ) : (() => {
                const q = coachingSearch.toLowerCase()
                const soloRows = coachingSessions.filter(s => {
                  if (s.group_id) return false
                  return !q || s.student_name?.toLowerCase().includes(q) || s.coach_name?.toLowerCase().includes(q)
                }).map(s => ({ ...s, _type: 'solo' }))
                const groupRows = groupSessions.filter(g =>
                  !q || g.coach_name?.toLowerCase().includes(q) || g.student_names?.some(n => n.toLowerCase().includes(q))
                ).map(g => ({ ...g, _type: 'group' }))
                const allRows = [...soloRows, ...groupRows].sort((a, b) => {
                  const coachCmp = (a.coach_name ?? '').localeCompare(b.coach_name ?? '')
                  if (coachCmp !== 0) return coachCmp
                  return (a.start_time ?? '').localeCompare(b.start_time ?? '')
                })
                if (allRows.length === 0) return (
                  <p className="text-gray-800 text-sm">No coaching sessions on this date.</p>
                )
                return (
                  <div className="card p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-300">
                          {['Type', 'Student(s)', 'Coach', 'Time', 'Notes', 'Actions'].map(h => (
                            <th key={h} className={`sticky top-0 bg-gray-100 text-left px-3 py-3 text-xs text-gray-700 font-semibold uppercase tracking-wider${h === 'Notes' ? ' hidden md:table-cell' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allRows.map(row => {
                        if (row._type === 'solo') { const s = row;
                          const ciRecord = adminCheckIns.find(ci => ci.type === 'coaching' && ci.reference_id === String(s.id) && ci.user_id === s.student_id)
                          const adminCI = s.admin_checked_in || adminCheckedIn.has(s.id) || !!ciRecord
                          const isNoShow = ciRecord?.no_show === true || (s.admin_checked_in && s.no_show === true)
                          const bal = sessionBalances[s.student_id]
                          return (
                            <tr key={s.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap">1-on-1</span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleOpenMemberModal(s.student_id)}
                                    className="font-medium text-gray-900 hover:text-blue-700 transition-colors text-left text-sm"
                                  >{s.student_name}</button>
                                </div>
                                {bal !== undefined && (
                                  <span className={`text-[11px] font-mono ${bal < 0 ? 'text-red-600' : bal < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>${bal.toFixed(0)}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <button onClick={() => { const ci = coaches.find(c => c.id === s.coach_id); setCoachViewModal({ coach_id: s.coach_id, coach_name: s.coach_name, email: ci?.email, phone: ci?.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                  className="text-gray-800 hover:text-blue-600 transition-colors text-left">{s.coach_name}</button>
                              </td>
                              <td className="px-3 py-3 text-gray-700 text-xs font-mono whitespace-nowrap">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</td>
                              <td className="px-3 py-3 text-gray-600 text-xs max-w-[140px] hidden md:table-cell">
                                <div className="truncate">{s.notes ?? '—'}</div>
                                {s.student_rating && (
                                  <div className="flex items-center gap-0.5 mt-1">
                                    {[1,2,3,4,5].map(n => (
                                      <span key={n} className={`text-xs ${n <= s.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                                    ))}
                                  </div>
                                )}
                                {(s.review_body || s.review_skills?.length > 0) && (
                                  <div className="mt-1 text-gray-400 text-[10px] italic truncate max-w-[130px]" title={s.review_body}>
                                    📝 {s.review_body || s.review_skills?.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    {!adminCI ? (
                                      <>
                                        <button onClick={() => handleAdminCheckInCoaching(s.id, s.student_id)} className="text-xs font-medium text-gray-400 hover:text-emerald-700 transition-colors whitespace-nowrap">Check In</button>
                                        <span className="text-gray-300 text-xs">·</span>
                                        <button onClick={() => handleAdminNoShow(s.id, s.student_id)} className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors whitespace-nowrap">No Show</button>
                                      </>
                                    ) : isNoShow ? (
                                      <button onClick={() => handleAdminUndoCheckInCoaching(s.id, s.student_id)} className="text-xs font-medium text-red-500 hover:text-gray-400 transition-colors whitespace-nowrap" title="Undo">✗ No Show</button>
                                    ) : (
                                      <button onClick={() => handleAdminUndoCheckInCoaching(s.id, s.student_id)} className="text-xs font-medium text-emerald-600 hover:text-gray-400 transition-colors whitespace-nowrap" title="Undo">✓ In</button>
                                    )}
                                  </div>
                                  <div className="mt-2 pt-1 border-t border-gray-100 flex gap-2">
                                    {s.recurrence_id && (
                                      <button
                                        onClick={() => openTransferModal({
                                          direction: 'to-group',
                                          studentId: s.student_id, studentName: s.student_name,
                                          recurrenceId: s.recurrence_id,
                                          coachId: s.coach_id, coachName: s.coach_name,
                                          startTime: s.start_time, endTime: s.end_time,
                                          fromDate: coachingDate,
                                          targetGroupId: null,
                                        })}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                      >→ Group</button>
                                    )}
                                    <button onClick={() => handleCancelSession(s.id)} className="text-xs text-red-600 hover:text-red-800 font-medium">Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        } else { const g = row;
                          const studentData = g.student_names.map((name, i) => {
                            const sid = g.student_ids?.[i]
                            const sessionId = g.session_ids?.[i]
                            const bal = sid !== undefined ? sessionBalances[sid] : undefined
                            const ciRec = adminCheckIns.find(ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === sid)
                            const adminCI = g.admin_checked_ins?.[i] === true || (sessionId !== undefined && adminCheckedIn.has(sessionId)) || !!ciRec
                            const isNS = ciRec?.no_show === true
                            return { name, sid, sessionId, bal, adminCI, isNS }
                          })
                          return (
                          <tr key={g.group_id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors align-top">
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-100 text-teal-800 border border-teal-200 whitespace-nowrap">Group</span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col divide-y divide-gray-100">
                                {studentData.map(({ name, sid, bal }, i) => (
                                  <div key={i} className="py-2 first:pt-0 last:pb-0">
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => sid !== undefined && handleOpenMemberModal(sid)} className="font-medium text-gray-900 hover:text-blue-700 transition-colors text-sm text-left">{name}</button>
                                      {sid !== undefined && (
                                        <button
                                          onClick={() => openTransferModal({
                                            direction: 'to-solo',
                                            studentId: sid, studentName: name,
                                            groupId: g.group_id,
                                            coachId: g.coach_id, coachName: g.coach_name,
                                            startTime: g.start_time, endTime: g.end_time,
                                            fromDate: coachingDate,
                                          })}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium whitespace-nowrap"
                                          title="Transfer to 1-on-1"
                                        >→ 1:1</button>
                                      )}
                                    </div>
                                    {bal !== undefined && <span className={`text-[11px] font-mono ${bal < 0 ? 'text-red-600' : bal < 50 ? 'text-amber-600' : 'text-emerald-600'}`}>${bal.toFixed(0)}</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <button onClick={() => { const ci = coaches.find(c => c.id === g.coach_id); setCoachViewModal({ coach_id: g.coach_id, coach_name: g.coach_name, email: ci?.email, phone: ci?.phone }); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                                className="text-gray-800 hover:text-blue-600 transition-colors text-left">{g.coach_name}</button>
                            </td>
                            <td className="px-3 py-3 text-gray-700 text-xs font-mono whitespace-nowrap">{fmtTime(g.start_time)} – {fmtTime(g.end_time)}</td>
                            <td className="px-3 py-3 text-gray-600 text-xs max-w-[140px] truncate hidden md:table-cell">{g.notes ?? '—'}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-col divide-y divide-gray-100">
                                  {studentData.map(({ sessionId, sid, adminCI, isNS }, i) => (
                                    <div key={i} className="py-2 first:pt-0 flex items-center gap-1.5">
                                      {!adminCI ? (
                                        <>
                                          <button onClick={() => handleAdminCheckInCoaching(sessionId, sid)} className="text-xs font-medium text-gray-400 hover:text-emerald-700 transition-colors whitespace-nowrap">Check In</button>
                                          <span className="text-gray-300 text-xs">·</span>
                                          <button onClick={() => handleAdminNoShow(sessionId, sid)} className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors whitespace-nowrap">No Show</button>
                                        </>
                                      ) : isNS ? (
                                        <button onClick={() => handleAdminUndoCheckInCoaching(sessionId, sid)} className="text-xs font-medium text-red-500 hover:text-gray-400 transition-colors whitespace-nowrap" title="Undo">✗ No Show</button>
                                      ) : (
                                        <button onClick={() => handleAdminUndoCheckInCoaching(sessionId, sid)} className="text-xs font-medium text-emerald-600 hover:text-gray-400 transition-colors whitespace-nowrap" title="Undo">✓ In</button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2 pt-2 mt-1 border-t-2 border-gray-200">
                                  <button onClick={() => { setGroupEditModal(g); setGroupEditAddSearch(''); setGroupEditSessionDate(null); setGroupEditForm({ date: '', start_time: '', end_time: '' }); setGroupEditSelected(new Set()) }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                                  <button onClick={() => handleCancelGroupSession(g.group_id)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium">Cancel</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          )
                        }
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* dead group form stub */}
          {false && (() => {
                const formDow      = groupForm.date ? new Date(groupForm.date + 'T12:00:00').getDay() : null
                const effectiveDows = groupForm.selectedDays.length ? groupForm.selectedDays : (formDow != null ? [formDow] : [])
                const hasSat  = effectiveDows.includes(6)
                const hasWkd  = effectiveDows.some(d => d !== 6)
                const formSlots = hasSat && hasWkd ? ALL_SLOTS : hasSat ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                const formClosing = slotClosing(formSlots)
                const endSlots  = [...formSlots, formClosing].filter(s => !groupForm.start_time || toMins(s) > toMins(groupForm.start_time))
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
                    <p className="text-xs text-gray-800 uppercase tracking-widest">New Group Coaching Session</p>
                    <p className="text-xs text-gray-800">Assign 2–5 students to one coach. They share a single court.</p>

                    <div>
                      <label className="block text-xs text-gray-800 mb-1">Coach</label>
                      <select className="input w-full" value={groupForm.coach_id}
                        onChange={e => setGroupForm(f => ({ ...f, coach_id: e.target.value }))}>
                        <option value="">Select coach…</option>
                        {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-800 mb-1">
                        Students ({selectedStudents.length}/5 selected)
                      </label>
                      {/* Selected chips */}
                      {selectedStudents.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {selectedStudents.map(m => {
                            const bal = groupStudentBalances[m.id]
                            return (
                              <span key={m.id} className="flex items-center gap-1 bg-brand-500/20 border border-brand-500/40 text-gray-800 text-xs px-2.5 py-1 rounded-full">
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
                        <div className="mt-1 border border-gray-200 rounded-lg overflow-y-auto max-h-[160px] bg-court">
                          {filteredStudents.map(m => (
                            <button key={m.id} type="button"
                              onClick={async () => {
                                setGroupForm(f => ({ ...f, student_ids: [...f.student_ids, m.id] }))
                                setGroupStudentSearch('')
                                try {
                                  const { data } = await coachingAPI.getHoursBalance(m.id)
                                  setGroupStudentBalances(b => ({ ...b, [m.id]: data.balance }))
                                } catch {}
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 transition-colors"
                            >
                              {m.name}<span className="text-gray-800 text-xs ml-2">{m.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-gray-800 mb-1">Starting week</label>
                      <input type="date" className="input w-full" value={groupForm.date}
                        onChange={e => setGroupForm(f => ({ ...f, date: e.target.value, start_time: '', end_time: '' }))} />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-800 mb-1">Days of week</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{dow:1,label:'Mon'},{dow:2,label:'Tue'},{dow:3,label:'Wed'},{dow:6,label:'Sat'}].map(({dow,label}) => {
                          const active = groupForm.selectedDays.includes(dow)
                          return (
                            <button key={dow} type="button"
                              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${active ? 'bg-emerald-600 text-gray-900' : 'bg-slate-700 text-gray-800 hover:bg-slate-600'}`}
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
                      <p className="mt-1 text-xs text-gray-800">Leave all unselected to use the starting-week date as-is.</p>
                    </div>

                    {effectiveDows.length > 1 ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-gray-800">Times per day</label>
                        {effectiveDows.map(dow => {
                          const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]
                          const slots = dow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
                          const dt = groupForm.dayTimes[dow] || { start_time: '', end_time: '' }
                          const eSlots = [...slots, slotClosing(slots)].filter(s => !dt.start_time || toMins(s) > toMins(dt.start_time))
                          return (
                            <div key={dow} className="flex gap-2 items-center">
                              <span className="text-xs text-gray-800 w-8">{dayLabel}</span>
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
                        <label className="block text-xs text-gray-800 mb-1">Start Time</label>
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
                        <label className="block text-xs text-gray-800 mb-1">End Time</label>
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
                      <label className="block text-xs text-gray-800 mb-1">Recurring — N weeks (1 = one-off)</label>
                      <input type="number" min={1} max={52} className="input w-32"
                        value={groupForm.weeks}
                        onChange={e => setGroupForm(f => ({ ...f, weeks: Number(e.target.value) }))} />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-800 mb-1">Notes (optional)</label>
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
                        <p className="text-xs text-gray-800">
                          Will credit <span className="font-medium text-gray-900">{total.toFixed(1)} hrs</span> to each student
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


          {/* ── Hours sub-tab ── */}
          {coachingSubTab === 'hours' && (
            <div className="space-y-6">
              {/* Student search */}
              <div className="card space-y-4">
                <h3 className="text-sm font-normal text-gray-800">Student Hours Balance</h3>
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
                        const [{ data }, { data: pd }] = await Promise.all([
                          coachingAPI.getHoursBalance(match.id),
                          coachingAPI.getStudentPrices(match.id),
                        ])
                        setHoursTarget({ user_id: match.id, name: match.name, balance: data.balance, ledger: data.ledger, soloPrice: pd.solo_price, groupPrice: pd.group_price })
                        setHoursForm({ delta: '', note: '' })
                        setHoursPricingForm({ solo: String(pd.solo_price ?? ''), group: String(pd.group_price ?? ''), saving: false })
                      } finally { setHoursLoading(false) }
                    }}
                  >
                    Look Up
                  </button>
                </div>

                {/* Suggestions */}
                {hoursStudentSearch && (
                  <ul className="divide-y divide-court-light max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                    {members
                      .filter(m => m.name?.toLowerCase().includes(hoursStudentSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(m => (
                        <li key={m.id}>
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 transition-colors"
                            onClick={async () => {
                              setHoursStudentSearch(m.name)
                              setHoursLoading(true)
                              try {
                                const [{ data }, { data: pd }] = await Promise.all([
                                  coachingAPI.getHoursBalance(m.id),
                                  coachingAPI.getStudentPrices(m.id),
                                ])
                                setHoursTarget({ user_id: m.id, name: m.name, balance: data.balance, ledger: data.ledger, soloPrice: pd.solo_price, groupPrice: pd.group_price })
                                setHoursForm({ delta: '', note: '' })
                                setHoursPricingForm({ solo: String(pd.solo_price ?? ''), group: String(pd.group_price ?? ''), saving: false })
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
                    <p className="text-sm font-normal text-gray-900">{hoursTarget.name}</p>
                  </div>
                  {/* Balance display */}
                  <div className="bg-court rounded-lg p-4 text-center">
                    <p className="text-[10px] text-gray-800 uppercase tracking-wide mb-1">Balance</p>
                    <p className={`text-3xl font-normal ${(hoursTarget.balance ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${(hoursTarget.balance ?? 0).toFixed(2)}
                    </p>
                  </div>

                  {/* Per-student pricing */}
                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <p className="text-xs text-gray-800">Session pricing</p>
                    <div className="flex gap-2 items-center">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-xs text-gray-500 whitespace-nowrap">1-on-1 $</span>
                        <input
                          type="number" min="0" step="0.01"
                          className="input text-sm py-1 w-full"
                          placeholder="e.g. 70"
                          value={hoursPricingForm.solo}
                          onChange={e => setHoursPricingForm(f => ({ ...f, solo: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Group $</span>
                        <input
                          type="number" min="0" step="0.01"
                          className="input text-sm py-1 w-full"
                          placeholder="e.g. 50"
                          value={hoursPricingForm.group}
                          onChange={e => setHoursPricingForm(f => ({ ...f, group: e.target.value }))}
                        />
                      </div>
                      <button
                        className="btn-primary text-sm py-1 px-3 whitespace-nowrap"
                        disabled={hoursPricingForm.saving || !hoursPricingForm.solo || !hoursPricingForm.group}
                        onClick={async () => {
                          setHoursPricingForm(f => ({ ...f, saving: true }))
                          try {
                            const { data: pd } = await coachingAPI.updateStudentPrices(hoursTarget.user_id, {
                              solo_price: parseFloat(hoursPricingForm.solo),
                              group_price: parseFloat(hoursPricingForm.group),
                            })
                            setHoursTarget(t => ({ ...t, soloPrice: pd.solo_price, groupPrice: pd.group_price }))
                          } finally {
                            setHoursPricingForm(f => ({ ...f, saving: false }))
                          }
                        }}
                      >
                        {hoursPricingForm.saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Manual adjustment form */}
                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <p className="text-xs text-gray-800">Manual adjustment</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="1"
                        className="input w-28"
                        placeholder="e.g. 500"
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
                            })
                            const { data } = await coachingAPI.getHoursBalance(hoursTarget.user_id)
                            setHoursTarget(prev => ({ ...prev, balance: data.balance, ledger: data.ledger }))
                            setHoursForm({ delta: '', note: '' })
                          } finally { setHoursLoading(false) }
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Ledger */}
                  {hoursTarget.ledger?.length > 0 && (
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-800 mb-2">Recent transactions</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-800 text-left">
                            <th className="py-1 pr-4">Date</th>
                            <th className="py-1 pr-3">Type</th>
                            <th className="py-1 pr-4">Amount</th>
                            <th className="py-1">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-court-light">
                          {hoursTarget.ledger.map(entry => (
                            <tr key={entry.id}>
                              <td className="py-1.5 pr-4 text-gray-800 whitespace-nowrap">
                                {new Date(entry.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="py-1.5 pr-3">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.session_type === 'group' ? 'bg-teal-500/15 text-teal-600' : entry.session_type === 'credit' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {entry.session_type === 'group' ? 'Group' : entry.session_type === 'credit' ? 'Credit' : '1-on-1'}
                                </span>
                              </td>
                              <td className={`py-1.5 pr-4 font-mono font-medium ${parseFloat(entry.delta) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {parseFloat(entry.delta) >= 0 ? '+' : ''}${Math.abs(parseFloat(entry.delta)).toFixed(2)}
                              </td>
                              <td className="py-1.5 text-gray-800">{entry.note || '—'}</td>
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

          {/* ── Reviews sub-tab ── */}
          {coachingSubTab === 'reviews' && (
            <div className="space-y-4">
              {reviewsLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : allReviews.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews yet.</p>
              ) : selectedReviewStudent ? (() => {
                const studentReviews = allReviews.filter(r => r.student_name === selectedReviewStudent)
                return (
                  <div className="space-y-3">
                    <button
                      onClick={() => setSelectedReviewStudent(null)}
                      className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
                    >
                      ← All students
                    </button>
                    <h3 className="text-sm font-medium text-gray-900">{selectedReviewStudent}</h3>
                    <div className="space-y-3">
                      {studentReviews.map(r => (
                        <div key={r.session_id} className="card space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-900">
                              {new Date(r.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}
                              {' · '}{r.coach_name}
                            </p>
                            <p className="text-xs text-gray-400">{fmtTime(r.start_time)}–{fmtTime(r.end_time)}</p>
                          </div>
                          {(r.review_body || (r.review_skills?.length > 0)) && (
                            <div className="border-l-2 border-sky-200 pl-3 space-y-1">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Coach</p>
                              {r.review_skills?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {r.review_skills.map(k => (
                                    <span key={k} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">{k}</span>
                                  ))}
                                </div>
                              )}
                              {r.review_body && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.review_body}</p>}
                            </div>
                          )}
                          {r.student_rating != null && (
                            <div className="border-l-2 border-amber-200 pl-3 space-y-1">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Student</p>
                              <div className="flex items-center gap-1">
                                {[1,2,3,4,5].map(n => (
                                  <span key={n} className={`text-sm ${n <= r.student_rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                                ))}
                              </div>
                              {r.student_comment && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.student_comment}</p>}
                            </div>
                          )}
                          {!r.review_body && !r.review_skills?.length && r.student_rating == null && (
                            <p className="text-xs text-gray-400 italic">No content yet.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })() : (() => {
                // Group by student, compute avg rating
                const byStudent = {}
                for (const r of allReviews) {
                  if (!byStudent[r.student_name]) byStudent[r.student_name] = []
                  byStudent[r.student_name].push(r)
                }
                return (
                  <div className="card divide-y divide-gray-100">
                    {Object.entries(byStudent).map(([name, reviews]) => {
                      const rated = reviews.filter(r => r.student_rating != null)
                      const avg   = rated.length ? (rated.reduce((s, r) => s + r.student_rating, 0) / rated.length) : null
                      const latest = reviews[0]
                      const latestDate = latest?.date ? new Date(latest.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : ''
                      return (
                        <button
                          key={name}
                          onClick={() => setSelectedReviewStudent(name)}
                          className="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{name}</p>
                            <p className="text-xs text-gray-400">{reviews.length} session{reviews.length !== 1 ? 's' : ''} · Latest: {latestDate}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {avg != null ? (
                              <>
                                <span className="text-amber-400 text-sm">★</span>
                                <span className="text-sm text-gray-700">{avg.toFixed(1)}</span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">No rating</span>
                            )}
                            <span className="text-gray-300 ml-2">›</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

        </div>
      )}

      {/* ── Pay Report section (inside Analytics) ────────────────────────── */}
      {activeTab === 'Analytics' && (
        <div className="animate-fade-in space-y-6 mb-10">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-2">Pay Report</h3>
          <p className="text-xs text-gray-800">
            Sessions count only when <span className="text-gray-900">an admin checks in</span> the student. Self check-ins by students or coaches do not count toward pay.
          </p>

          {/* Date range picker */}
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-gray-800 mb-1">From</label>
                <input type="date" className="input" value={payFrom}
                  onChange={e => setPayFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-800 mb-1">To</label>
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
              <p className="text-gray-800 text-sm">No confirmed coaching sessions in this period.</p>
            ) : (
              <div className="space-y-6">
                {payReport.map(coach => {
                  const weeks = groupByWeek(coach.sessions)
                  const isExpanded = expandedCoaches[coach.coach_id] === true
                  return (
                    <div key={coach.coach_id} className="card p-0 overflow-hidden">
                      <button
                        onClick={() => setExpandedCoaches(prev => ({ ...prev, [coach.coach_id]: !isExpanded }))}
                        className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100/20 text-left"
                      >
                        <div>
                          <p className="text-gray-900 flex items-center gap-2">
                            {coach.coach_name}
                            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </p>
                          {!coach.has_account && (
                            <p className="text-[10px] text-yellow-500 mt-0.5">
                              No linked account — coach check-in unavailable; sessions will not count
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-emerald-400">{coach.counted} counted</p>
                          <p className="text-xs text-gray-800">{coach.total} total sessions</p>
                        </div>
                      </button>
                      {isExpanded && weeks.map(week => (
                        <div key={week.weekStart}>
                          <div className="flex items-center justify-between px-5 py-2 bg-gray-100/10 border-b border-gray-200/40">
                            <p className="text-xs text-gray-800">
                              Week of {new Date(week.weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-xs text-gray-800">
                              <span className="text-emerald-400">{week.counted}</span>{' '}/ {week.total} counted
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col className="w-[22%]" />
                              <col className="w-[30%]" />
                              <col className="w-[24%]" />
                              <col className="w-[14%]" />
                              <col className="w-[10%]" />
                            </colgroup>
                            <tbody>
                              {week.sessions.map(s => (
                                <tr key={s.session_id} className={`border-b border-gray-200/30 last:border-0 ${s.counted ? '' : 'opacity-50'}`}>
                                  <td className="px-5 py-3 text-gray-800 text-xs whitespace-nowrap">
                                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  </td>
                                  <td className="px-5 py-3 text-gray-900 text-xs">
                                    <span className="block truncate">
                                      {s.student_name}
                                      {s.is_group && <span className="ml-1.5 text-[10px] bg-teal-500/15 text-teal-600 px-1.5 py-0.5 rounded-full">Group</span>}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-gray-800 text-xs font-mono whitespace-nowrap">
                                    {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                                  </td>
                                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                                    {s.admin_checked_in
                                      ? <span className="text-sky-400">Admin ✓</span>
                                      : <span className="text-gray-800">Not checked in</span>
                                    }
                                  </td>
                                  <td className="px-3 py-3 text-xs">
                                    {s.counted ? <span className="text-emerald-400">Counted</span> : <span className="text-gray-800">Not counted</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
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
                <p className="text-xs text-gray-800 uppercase tracking-widest">New Social Play Session</p>

                {/* Row 1: Title + Courts */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-800 mb-1">Title <span className="text-gray-400">(default: "Social Play")</span></label>
                    <input
                      type="text" className="input w-full" placeholder="e.g. Saturday Casual"
                      value={socialForm.title}
                      onChange={e => setSocialForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs text-gray-800 mb-1">Courts</label>
                    <select
                      className="input w-full"
                      value={socialForm.num_courts}
                      onChange={e => setSocialForm(f => ({ ...f, num_courts: Number(e.target.value) }))}
                    >
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Description */}
                <div>
                  <label className="block text-xs text-gray-800 mb-1">Description <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    className="input w-full h-14 resize-none" placeholder="Any notes for members…"
                    value={socialForm.description}
                    onChange={e => setSocialForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Row 3: Date */}
                <div>
                  <label className="block text-xs text-gray-800 mb-1">Date</label>
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
                        <label className="block text-xs text-gray-800 mb-1">Start Time</label>
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
                        <label className="block text-xs text-gray-800 mb-1">End Time</label>
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

                <div className="flex gap-4 items-end flex-wrap">
                  <div>
                    <label className="block text-xs text-gray-800 mb-1">Max Players</label>
                    <input
                      type="number" min={2} max={50} className="input w-32"
                      value={socialForm.max_players}
                      onChange={e => setSocialForm(f => ({ ...f, max_players: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-800 mb-1">Repeat (weeks)</label>
                    <input
                      type="number" min={1} max={52} className="input w-24"
                      value={socialForm.weeks}
                      onChange={e => setSocialForm(f => ({ ...f, weeks: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-800 mb-1">Price (AUD $, 0 = free)</label>
                    <input
                      type="number" min={0} step={0.50} className="input w-32"
                      placeholder="0.00"
                      value={socialForm.price_cents}
                      onChange={e => setSocialForm(f => ({ ...f, price_cents: e.target.value }))}
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
              <label className="text-sm text-gray-800">Filter by date</label>
              <input
                type="date"
                value={socialDateFilter}
                onChange={e => { setSocialDateFilter(e.target.value); setSocialPage(0) }}
                className="input text-sm px-3 py-1.5"
              />
              {socialDateFilter && (
                <button
                  onClick={() => { setSocialDateFilter(''); setSocialPage(0) }}
                  className="text-sm text-gray-800 hover:text-gray-900 transition-colors"
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

          {/* Sessions list — grouped by recurrence series */}
          {(() => {
            const filtered = socialSessions
              .filter(s => !socialDateFilter || s.date?.slice(0, 10) === socialDateFilter)
              .filter(s => {
                const q = socialSearch.toLowerCase()
                return !q || s.participants?.some(p => p.name?.toLowerCase().includes(q)) || s.title?.toLowerCase().includes(q)
              })

            if (loading) return <p className="text-gray-800 text-sm">Loading sessions…</p>
            if (filtered.length === 0) return <p className="text-gray-800 text-sm">{socialDateFilter ? 'No sessions on this date.' : 'No upcoming social play sessions.'}</p>

            // Group: recurrence_id → sessions[]; null → individual cards
            const seriesMap = new Map()  // recurrence_id → sessions[]
            const standalone = []
            for (const s of filtered) {
              if (s.recurrence_id) {
                if (!seriesMap.has(s.recurrence_id)) seriesMap.set(s.recurrence_id, [])
                seriesMap.get(s.recurrence_id).push(s)
              } else {
                standalone.push(s)
              }
            }

            // Standalone card (used for non-recurring sessions)
            const SessionCard = ({ s }) => {
              const e = editingSocial[s.id]
              const setField = (field, val) => setEditingSocial(prev => ({ ...prev, [s.id]: { ...prev[s.id], [field]: val } }))
              const closeEdit = () => setEditingSocial(prev => { const n = { ...prev }; delete n[s.id]; return n })
              const picker = addingMember[s.id] ?? { query: '', userId: '' }
              const existingIds = new Set(s.participants.map(p => p.id))
              const suggestions = picker.query.length > 0
                ? members.filter(m => !existingIds.has(m.id) && !m.is_walkin && m.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6)
                : []
              const isManaging = managingSession === s.id
              const filled = s.online_count ?? s.participant_count

              return (
                <div className="card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-base">{s.title}</p>
                      <p className="text-xs text-gray-800 font-medium mt-0.5">
                        {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' · '}{fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                        {' · '}{s.num_courts} court{s.num_courts !== 1 ? 's' : ''}
                      </p>
                      {s.description && <p className="text-sm text-gray-800 mt-1">{s.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-500">{filled}/{s.max_players}</span>
                      <button
                        onClick={() => setEditingSocial(prev => ({ ...prev, [s.id]: { title: s.title, date: s.date, start_time: s.start_time.slice(0,5), end_time: s.end_time.slice(0,5), max_players: s.max_players, price_dollars: s.price_cents > 0 ? (s.price_cents / 100).toFixed(2) : '' } }))}
                        className="text-xs text-sky-500 hover:text-sky-400"
                      >Edit</button>
                      <button onClick={() => handleCancelSocialSession(s.id)} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                    </div>
                  </div>

                  {e && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs">
                      <input type="text" className="input py-1 px-2 text-sm w-full" placeholder="Session name"
                        value={e.title} onChange={ev => setField('title', ev.target.value)} />
                      <div className="flex items-center gap-2">
                        <input type="date" className="input py-1 px-2 text-xs flex-1"
                          value={e.date} onChange={ev => setField('date', ev.target.value)} />
                        <span className="text-gray-400">Max</span>
                        <input type="number" min="1" className="input py-1 px-2 text-xs w-16"
                          value={e.max_players} onChange={ev => setField('max_players', ev.target.value)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="time" className="input py-1 px-2 text-xs flex-1"
                          value={e.start_time} onChange={ev => setField('start_time', ev.target.value)} />
                        <span className="text-gray-400">–</span>
                        <input type="time" className="input py-1 px-2 text-xs flex-1"
                          value={e.end_time} onChange={ev => setField('end_time', ev.target.value)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 whitespace-nowrap">Price AUD $</span>
                        <input type="number" min="0" step="0.01" className="input py-1 px-2 text-xs flex-1"
                          placeholder="0.00"
                          value={e.price_dollars ?? ''} onChange={ev => setField('price_dollars', ev.target.value)} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleSaveSocial(s.id)} className="text-xs text-emerald-500 font-medium">Save</button>
                        <button onClick={closeEdit} className="text-xs text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${filled / s.max_players >= 0.9 ? 'bg-red-500' : 'bg-brand-500'}`}
                        style={{ width: `${Math.min(Math.round(filled / s.max_players * 100), 100)}%` }}
                      />
                    </div>
                    {s.walkin_count > 0 && <p className="text-xs text-gray-400 mb-1">{s.walkin_count} walk-in</p>}
                    <button onClick={() => setManagingSession(prev => prev === s.id ? null : s.id)} className="text-xs text-sky-500 hover:text-sky-400 mb-2">
                      {isManaging ? 'Hide participants ▲' : `Manage participants (${filled}) ▼`}
                    </button>
                    {isManaging && (
                      <div className="space-y-2">
                        {s.participant_count < s.max_players && (
                          <div className="relative">
                            <div className="flex items-center gap-2">
                              <input type="text" placeholder="Type name to add…" className="input text-xs py-1 px-2 flex-1"
                                value={picker.query}
                                onChange={ev => setAddingMember(prev => ({ ...prev, [s.id]: { query: ev.target.value, userId: '' } }))}
                              />
                              {picker.userId && <button onClick={() => handleSocialAddMember(s.id, picker.userId)} className="text-xs text-emerald-400 font-medium whitespace-nowrap">Add</button>}
                              <button onClick={() => handleSocialAddWalkin(s.id)} className="text-xs text-gray-800 font-medium whitespace-nowrap border border-slate-600 hover:border-slate-400 rounded px-2 py-1 transition-colors">+ Walk-in</button>
                            </div>
                            {suggestions.length > 0 && (
                              <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-100 border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                {suggestions.map(m => (
                                  <button key={m.id} className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-200 transition-colors"
                                    onClick={() => setAddingMember(prev => ({ ...prev, [s.id]: { query: m.name, userId: m.id } }))}
                                  >{m.name}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {s.participants.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {s.participants.map(p => (
                              <span key={p.id} className={`text-xs rounded-full px-2.5 py-0.5 flex items-center gap-1 ${p.is_walkin ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-800'}`}>
                                {p.name}
                                <button onClick={() => handleSocialRemoveMember(s.id, p.id)} className="text-gray-800 hover:text-red-400 transition-colors leading-none">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // Compact row inside an expanded series (table-style)
            const SeriesRow = ({ s }) => {
              const e = editingSocial[s.id]
              const setField = (field, val) => setEditingSocial(prev => ({ ...prev, [s.id]: { ...prev[s.id], [field]: val } }))
              const closeEdit = () => setEditingSocial(prev => { const n = { ...prev }; delete n[s.id]; return n })
              const picker = addingMember[s.id] ?? { query: '', userId: '' }
              const existingIds = new Set(s.participants.map(p => p.id))
              const suggestions = picker.query.length > 0
                ? members.filter(m => !existingIds.has(m.id) && !m.is_walkin && m.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6)
                : []
              const isManaging = managingSession === s.id
              const filled = s.online_count ?? s.participant_count
              const pct = Math.min(Math.round(filled / s.max_players * 100), 100)

              return (
                <div className="border-b border-gray-100 last:border-0">
                  {/* Main row */}
                  <div className="flex items-center gap-4 py-3 px-1">
                    {/* Date */}
                    <div className="w-28 flex-shrink-0">
                      <p className="text-xs font-medium text-gray-900">
                        {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    {/* Time */}
                    <div className="w-36 flex-shrink-0 text-xs text-gray-600">
                      {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                    </div>
                    {/* Capacity */}
                    <div className="w-28 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{filled}/{s.max_players}</span>
                      </div>
                    </div>
                    {/* Participant preview chips */}
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                      {s.participants.slice(0, 4).map(p => (
                        <span key={p.id} className={`text-xs rounded-full px-2 py-0.5 ${p.is_walkin ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{p.name}</span>
                      ))}
                      {s.participants.length > 4 && (
                        <span className="text-xs text-gray-400">+{s.participants.length - 4} more</span>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => setManagingSession(prev => prev === s.id ? null : s.id)}
                        className="text-xs text-sky-500 hover:text-sky-400"
                      >People</button>
                      <button
                        onClick={() => setEditingSocial(prev => ({ ...prev, [s.id]: { title: s.title, date: s.date, start_time: s.start_time.slice(0,5), end_time: s.end_time.slice(0,5), max_players: s.max_players, price_dollars: s.price_cents > 0 ? (s.price_cents / 100).toFixed(2) : '' } }))}
                        className="text-xs text-sky-500 hover:text-sky-400"
                      >Edit</button>
                      <button onClick={() => handleCancelSocialSession(s.id)} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                    </div>
                  </div>

                  {/* Edit form (inline, below the row) */}
                  {e && (
                    <div className="bg-gray-50 rounded-xl mx-1 mb-3 p-3 space-y-2 text-xs">
                      <input type="text" className="input py-1 px-2 text-sm w-full" placeholder="Session name"
                        value={e.title} onChange={ev => setField('title', ev.target.value)} />
                      <div className="flex items-center gap-2">
                        <input type="date" className="input py-1 px-2 text-xs flex-1"
                          value={e.date} onChange={ev => setField('date', ev.target.value)} />
                        <span className="text-gray-400">Max</span>
                        <input type="number" min="1" className="input py-1 px-2 text-xs w-16"
                          value={e.max_players} onChange={ev => setField('max_players', ev.target.value)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="time" className="input py-1 px-2 text-xs flex-1"
                          value={e.start_time} onChange={ev => setField('start_time', ev.target.value)} />
                        <span className="text-gray-400">–</span>
                        <input type="time" className="input py-1 px-2 text-xs flex-1"
                          value={e.end_time} onChange={ev => setField('end_time', ev.target.value)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 whitespace-nowrap">Price AUD $</span>
                        <input type="number" min="0" step="0.01" className="input py-1 px-2 text-xs flex-1"
                          placeholder="0.00"
                          value={e.price_dollars ?? ''} onChange={ev => setField('price_dollars', ev.target.value)} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleSaveSocial(s.id)} className="text-xs text-emerald-500 font-medium">Save</button>
                        <button onClick={closeEdit} className="text-xs text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Participant management panel */}
                  {isManaging && (
                    <div className="bg-gray-50 rounded-xl mx-1 mb-3 p-3 space-y-2">
                      {s.participant_count < s.max_players && (
                        <div className="relative">
                          <div className="flex items-center gap-2">
                            <input type="text" placeholder="Type name to add…" className="input text-xs py-1 px-2 flex-1"
                              value={picker.query}
                              onChange={ev => setAddingMember(prev => ({ ...prev, [s.id]: { query: ev.target.value, userId: '' } }))}
                            />
                            {picker.userId && <button onClick={() => handleSocialAddMember(s.id, picker.userId)} className="text-xs text-emerald-400 font-medium whitespace-nowrap">Add</button>}
                            <button onClick={() => handleSocialAddWalkin(s.id)} className="text-xs text-gray-800 font-medium whitespace-nowrap border border-slate-600 hover:border-slate-400 rounded px-2 py-1 transition-colors">+ Walk-in</button>
                          </div>
                          {suggestions.length > 0 && (
                            <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-100 border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                              {suggestions.map(m => (
                                <button key={m.id} className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-200 transition-colors"
                                  onClick={() => setAddingMember(prev => ({ ...prev, [s.id]: { query: m.name, userId: m.id } }))}
                                >{m.name}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {s.participants.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {s.participants.map(p => (
                            <span key={p.id} className={`text-xs rounded-full px-2.5 py-0.5 flex items-center gap-1 ${p.is_walkin ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-800'}`}>
                              {p.name}
                              <button onClick={() => handleSocialRemoveMember(s.id, p.id)} className="text-gray-800 hover:text-red-400 transition-colors leading-none">×</button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">No participants yet.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div className="space-y-3">
                {/* Recurring series — collapsed by default */}
                {[...seriesMap.entries()].map(([rid, sessions]) => {
                  const first = sessions[0]
                  const isOpen = expandedSeriesIds.has(rid)
                  const dow = new Date(first.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long' })
                  const nextDate = new Date(first.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                  const totalParticipants = sessions.reduce((sum, s) => sum + (s.online_count ?? s.participant_count), 0)
                  const isEditingThis = editingSeries?.rid === rid
                  return (
                    <div key={rid} className="card p-0 overflow-hidden">
                      {/* Series header */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedSeriesIds(prev => {
                          const next = new Set(prev)
                          next.has(rid) ? next.delete(rid) : next.add(rid)
                          return next
                        })}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{first.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Every {dow} · {fmtTime(first.start_time)}–{fmtTime(first.end_time)} · {sessions.length} session{sessions.length !== 1 ? 's' : ''} · next: {nextDate}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-400">{totalParticipants} joined total</span>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingSeries(isEditingThis ? null : { rid, title: first.title, start_time: first.start_time.slice(0,5), end_time: first.end_time.slice(0,5), max_players: first.max_players, price_dollars: first.price_cents > 0 ? (first.price_cents / 100).toFixed(2) : '' }) }}
                            className="text-xs text-sky-500 hover:text-sky-400 font-medium"
                          >Edit Series</button>
                          <button
                            onClick={e => { e.stopPropagation(); openCancelSeriesModal(rid) }}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >Cancel Series</button>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Edit Series inline form */}
                      {isEditingThis && (
                        <div className="border-t border-gray-100 bg-blue-50/50 px-4 py-3 space-y-3">
                          <p className="text-xs font-medium text-blue-700 uppercase tracking-widest">Edit all upcoming sessions in this series</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <label className="text-xs text-gray-500 mb-1 block">Title</label>
                              <input type="text" className="input py-1.5 px-2 text-sm w-full"
                                value={editingSeries.title}
                                onChange={ev => setEditingSeries(prev => ({ ...prev, title: ev.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Start time</label>
                              <input type="time" className="input py-1.5 px-2 text-sm w-full"
                                value={editingSeries.start_time}
                                onChange={ev => setEditingSeries(prev => ({ ...prev, start_time: ev.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">End time</label>
                              <input type="time" className="input py-1.5 px-2 text-sm w-full"
                                value={editingSeries.end_time}
                                onChange={ev => setEditingSeries(prev => ({ ...prev, end_time: ev.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Max players</label>
                              <input type="number" min="1" className="input py-1.5 px-2 text-sm w-full"
                                value={editingSeries.max_players}
                                onChange={ev => setEditingSeries(prev => ({ ...prev, max_players: ev.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Price (AUD $, 0 = free)</label>
                              <input type="number" min="0" step="0.01" className="input py-1.5 px-2 text-sm w-full"
                                placeholder="0.00"
                                value={editingSeries.price_dollars}
                                onChange={ev => setEditingSeries(prev => ({ ...prev, price_dollars: ev.target.value }))} />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={handleSaveSeriesEdit}
                              disabled={editingSeries.saving}
                              className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-full hover:bg-blue-500 disabled:opacity-50 transition-colors"
                            >{editingSeries.saving ? 'Saving…' : `Save (${sessions.length} sessions)`}</button>
                            <button onClick={() => setEditingSeries(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Expanded individual sessions — table layout */}
                      {isOpen && (
                        <div className="border-t border-gray-100">
                          {/* Column headers */}
                          <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="w-28 flex-shrink-0 text-[10px] uppercase tracking-widest text-gray-400">Date</span>
                            <span className="w-36 flex-shrink-0 text-[10px] uppercase tracking-widest text-gray-400">Time</span>
                            <span className="w-28 flex-shrink-0 text-[10px] uppercase tracking-widest text-gray-400">Capacity</span>
                            <span className="flex-1 text-[10px] uppercase tracking-widest text-gray-400">Participants</span>
                            <span className="w-32 flex-shrink-0 text-[10px] uppercase tracking-widest text-gray-400 text-right">Actions</span>
                          </div>
                          <div className="px-4">
                            {sessions.map(s => <SeriesRow key={s.id} s={s} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Standalone (non-recurring) sessions */}
                {standalone.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {standalone.map(s => <SessionCard key={s.id} s={s} />)}
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      )}

      {/* ── Analytics section ────────────────────────────────────────────── */}
      {activeTab === 'Analytics' && (
        <div className="animate-fade-in space-y-8">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-2">Analytics</h3>
          {analyticsLoading ? (
            <p className="text-gray-800 text-sm">Loading analytics…</p>
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
                      <p className={`text-2xl font-normal ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-gray-800 mt-1">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Member growth chart ────────────────────────────────── */}
                <div className="card">
                  <p className="text-sm text-gray-900 mb-4">New Members — Last 12 Weeks</p>
                  {memberGrowth.length === 0 ? (
                    <p className="text-gray-800 text-xs">No data yet.</p>
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
                  <p className="text-sm text-gray-900 mb-4">Activity by Day &amp; Time Slot</p>
                  {slotPopularity.length === 0 ? (
                    <p className="text-gray-800 text-xs">No activity data yet.</p>
                  ) : (
                    <table className="text-xs w-full min-w-[400px]">
                      <thead>
                        <tr>
                          <th className="text-left text-gray-800 pr-3 py-1 font-normal w-12">Time</th>
                          {DAYS_ORDER.map(d => (
                            <th key={d} className="text-gray-800 font-normal py-1 text-center w-12">{DAY_LABELS[d]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allSlots.map(slot => (
                          <tr key={slot}>
                            <td className="text-gray-800 pr-3 py-0.5 font-mono">{fmtTime(slot + ':00')}</td>
                            {DAYS_ORDER.map(d => {
                              const cell = slotPopularity.find(r => r.dow === d && r.slot === slot)
                              const count = cell?.count ?? 0
                              const intensity = count / heatmapMax
                              const bg = count === 0
                                ? 'bg-gray-100'
                                : intensity > 0.66 ? 'bg-brand-500'
                                : intensity > 0.33 ? 'bg-brand-500/50'
                                : 'bg-brand-500/20'
                              return (
                                <td key={d} className="py-0.5 text-center">
                                  <div
                                    className={`mx-auto w-9 h-7 rounded flex items-center justify-center text-[10px] font-medium ${bg} ${count > 0 ? 'text-gray-900' : 'text-gray-800'}`}
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
                    <p className="text-sm text-gray-900">Member Attendance</p>
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
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${attendanceFilter === f ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-gray-200 text-gray-800 hover:text-gray-900'}`}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {['Member', 'Joined', 'Activities', 'Last Active', 'Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs text-gray-800 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAttendance.length === 0 ? (
                          <tr><td colSpan={5} className="text-center text-gray-800 text-xs py-6">No members found.</td></tr>
                        ) : filteredAttendance.map(m => (
                          <tr key={m.id} className="border-b border-gray-200/30 last:border-0 hover:bg-gray-100/10 transition-colors">
                            <td className="px-3 py-3">
                              <p className="text-gray-900 text-xs font-medium">{m.name}</p>
                              <p className="text-gray-800 text-[10px]">{m.email}</p>
                            </td>
                            <td className="px-3 py-3 text-gray-800 text-xs whitespace-nowrap">
                              {new Date(m.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-sm font-normal ${m.total_activities > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {m.total_activities}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-800 text-xs whitespace-nowrap">
                              {m.last_active
                                ? new Date(m.last_active + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.total_activities > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-500/15 text-red-400'}`}>
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


      {/* ── QR-Code tab ──────────────────────────────────────────────────── */}
      {activeTab === 'QR-Code' && (
        <div className="animate-fade-in space-y-6">

          {/* QR Code card */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign-In QR Code</h2>
                <p className="text-sm text-gray-500">Display or print this at the venue entrance. Members scan to sign in or sign out.</p>
              </div>
              <div className="flex gap-2 flex-wrap shrink-0">
                <button
                  onClick={() => {
                    const svgEl = document.querySelector('#venue-qr-area svg')
                    if (!svgEl) return
                    const clubName = venueQR?.club_name ?? 'TT Club'
                    const win = window.open('', '_blank')
                    win.document.write(`<!DOCTYPE html><html><head><title>QR Code — ${clubName}</title>
                      <style>
                        body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #fff; }
                        .wrap { text-align: center; padding: 40px; }
                        h1 { font-size: 24px; margin-bottom: 8px; }
                        p { color: #666; font-size: 14px; margin-top: 16px; }
                        svg { display: block; margin: 24px auto; }
                        @media print { button { display: none; } }
                      </style></head><body>
                      <div class="wrap">
                        <h1>${clubName}</h1>
                        <p style="font-size:13px;color:#999">Scan to sign in / sign out</p>
                        ${svgEl.outerHTML}
                        <p>Point your phone camera at this code</p>
                        <button onclick="window.print()" style="margin-top:20px;padding:10px 24px;font-size:14px;cursor:pointer;border:1px solid #ccc;border-radius:8px;background:#000;color:#fff">Print</button>
                      </div></body></html>`)
                    win.document.close()
                    win.focus()
                    setTimeout(() => win.print(), 500)
                  }}
                  className="btn-primary text-sm px-4 py-2">
                  🖨 Print QR
                </button>
                <button
                  onClick={() => setVenueRegenConfirm(true)}
                  className="btn-secondary text-sm px-4 py-2">
                  Regenerate
                </button>
              </div>
            </div>

            {venueRegenConfirm && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800">Regenerating will invalidate the current QR code. Any printed copies will stop working.</p>
                <div className="flex gap-2 shrink-0">
                  <button className="text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setVenueRegenConfirm(false)}>Cancel</button>
                  <button className="text-sm text-red-600 hover:text-red-700 font-medium"
                    onClick={async () => {
                      try {
                        const { data } = await venueAPI.regenerateQR()
                        setVenueQR(q => ({ ...q, ...data }))
                        setVenueRegenConfirm(false)
                      } catch { alert('Failed to regenerate.') }
                    }}>Regenerate</button>
                </div>
              </div>
            )}

            <div id="venue-qr-area" className="mt-6 flex justify-center">
              {venueQRLoading && (
                <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
              )}
              {venueQR && (
                <div className="p-4 bg-white border border-gray-200 rounded-2xl inline-block">
                  <QRCode value={venueQR.url} size={220} />
                  <p className="text-center text-xs text-gray-400 mt-3">Scan to sign in / sign out</p>
                </div>
              )}
            </div>
          </div>

          {/* Today's attendance */}
          <div className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-900">Attendance</h2>
              <input type="date" className="input text-sm py-1.5"
                value={venueDate}
                onChange={e => setVenueDate(e.target.value)} />
            </div>

            {venueLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
              </div>
            ) : venueCheckins.length === 0 ? (
              <p className="text-sm text-gray-500">No sign-ins for this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Name</th>
                      <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Role</th>
                      <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Signed In</th>
                      <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Signed Out</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {venueCheckins.map(row => {
                      const inTime  = row.checked_in_at  ? new Date(row.checked_in_at).toLocaleTimeString('en-AU',  { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'
                      const outTime = row.checked_out_at ? new Date(row.checked_out_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'
                      const durMs   = row.checked_out_at && row.checked_in_at
                        ? new Date(row.checked_out_at) - new Date(row.checked_in_at) : null
                      const dur = durMs ? (() => {
                        const m = Math.round(durMs / 60000)
                        const h = Math.floor(m / 60), mm = m % 60
                        return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`
                      })() : (row.checked_in_at ? 'Still in' : '—')
                      return (
                        <tr key={row.id}>
                          <td className="py-2.5 pr-4 font-medium text-gray-900">{row.name}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${row.role === 'admin' ? 'bg-purple-100 text-purple-700' : row.role === 'coach' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>
                              {row.role}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-gray-700">{inTime}</td>
                          <td className="py-2.5 pr-4 text-gray-700">{outTime}</td>
                          <td className={`py-2.5 text-sm ${dur === 'Still in' ? 'text-emerald-600 font-medium' : 'text-gray-600'}`}>{dur}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Shop Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'Shop' && <ShopManager />}

      {/* ── Articles Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'Articles' && <ArticlesManager />}

      {/* ── Cancel Series Selection Modal ─────────────────────────────────── */}
      {cancelSeriesModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
             onClick={e => { if (e.target === e.currentTarget) setCancelSeriesModal(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Select sessions to cancel</h3>
              <button onClick={() => setCancelSeriesModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Select all toggle */}
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none pb-1 border-b border-gray-100">
              <input type="checkbox"
                checked={cancelSeriesModal.selected.size === cancelSeriesModal.sessions.length}
                onChange={e => setCancelSeriesModal(prev => ({
                  ...prev,
                  selected: e.target.checked ? new Set(prev.sessions.map(s => s.id)) : new Set()
                }))}
              />
              Select all ({cancelSeriesModal.sessions.length} sessions)
            </label>

            {/* Session list */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {cancelSeriesModal.sessions.map(s => (
                <label key={s.id} className="flex items-center gap-2.5 text-sm cursor-pointer select-none hover:bg-gray-50 rounded-lg px-1 py-1">
                  <input type="checkbox"
                    checked={cancelSeriesModal.selected.has(s.id)}
                    onChange={e => setCancelSeriesModal(prev => {
                      const sel = new Set(prev.selected)
                      e.target.checked ? sel.add(s.id) : sel.delete(s.id)
                      return { ...prev, selected: sel }
                    })}
                  />
                  <span className="text-gray-800">
                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-gray-400 text-xs">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</span>
                </label>
              ))}
              {cancelSeriesModal.sessions.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No upcoming sessions found.</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setCancelSeriesModal(null)}
                className="flex-1 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Back
              </button>
              <button
                disabled={cancelSeriesModal.selected.size === 0}
                onClick={handleBatchCancel}
                className="flex-1 py-2 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40">
                Cancel {cancelSeriesModal.selected.size > 0 ? `${cancelSeriesModal.selected.size} session${cancelSeriesModal.selected.size > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar Reschedule Modal ─────────────────────────────────────── */}
      {calendarReschedule && (() => {
        const { ev, newDate, newStart, newEnd } = calendarReschedule
        const isSolo = calendarReschedule.type === 'solo'
        const label = isSolo ? ev.student_name : ev.student_names?.join(', ')

        // Check-in state for solo
        const soloCiRecord = isSolo
          ? adminCheckIns.find(ci => ci.type === 'coaching' && ci.reference_id === String(ev.id) && ci.user_id === ev.student_id)
          : null
        const soloCheckedIn = !!soloCiRecord
        const soloIsNoShow  = soloCiRecord?.no_show === true

        // Check-in state per student for group
        const groupStudents = !isSolo ? (ev.student_names ?? []).map((name, i) => {
          const sid = ev.student_ids?.[i]
          const sessionId = ev.session_ids?.[i]
          const ciRec = adminCheckIns.find(ci => ci.type === 'coaching' && ci.reference_id === String(sessionId) && ci.user_id === sid)
          return { name, sid, sessionId, checkedIn: !!ciRec, isNoShow: ciRec?.no_show === true }
        }) : []

        const todayISO = new Date().toISOString().slice(0, 10)
        const isPast = (ev.date ?? newDate ?? '')?.slice(0, 10) <= todayISO

        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
               onClick={e => { if (e.target === e.currentTarget) setCalendarReschedule(null) }}>
            <div className="bg-gray-50 border border-gray-200 rounded-xl w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 text-sm font-normal">Edit — {label}</h2>
                <button onClick={() => setCalendarReschedule(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>

              {/* ── Check-in section ── */}
              {isPast && (
                <div className="rounded-lg overflow-hidden border border-gray-200">
                  <div className="bg-gray-100 px-3 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance</p>
                  </div>
                  <div className="p-3 bg-white space-y-2">
                  {isSolo ? (
                    soloCheckedIn ? (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${soloIsNoShow ? 'text-red-500' : 'text-emerald-600'}`}>
                          {soloIsNoShow ? '✗ No Show' : '✓ Checked In'}
                        </span>
                        <button onClick={() => handleAdminUndoCheckIn('coaching', ev.id, ev.student_id)} className="text-xs text-gray-400 hover:text-gray-700 underline">Undo</button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleAdminCheckIn('coaching', ev.id, ev.student_id)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">✓ Check In</button>
                        <button onClick={() => handleAdminNoShow(ev.id, ev.student_id)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">✗ No Show</button>
                      </div>
                    )
                  ) : (
                    groupStudents.map(({ name, sid, sessionId, checkedIn, isNoShow }) => (
                      <div key={sid} className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 last:border-0">
                        <span className={`text-sm ${isNoShow ? 'text-red-400 line-through' : 'text-gray-800'}`}>{name}</span>
                        {checkedIn ? (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded-md ${isNoShow ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>{isNoShow ? '✗ No Show' : '✓ In'}</span>
                            <button onClick={() => handleAdminUndoCheckIn('coaching', sessionId, sid)} className="text-xs text-gray-400 hover:text-gray-700 underline">Undo</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleAdminCheckIn('coaching', sessionId, sid)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors">✓ In</button>
                            <button onClick={() => handleAdminNoShow(sessionId, sid)} className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors">✗ NS</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  </div>
                </div>
              )}

              {/* ── Reschedule section ── */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-800 mb-1">Date</label>
                  <input type="date" className="input w-full"
                    value={newDate}
                    onChange={e => setCalendarReschedule(prev => ({ ...prev, newDate: e.target.value }))} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-800 mb-1">Start</label>
                    <select className="input w-full"
                      value={newStart}
                      onChange={e => { const ns = e.target.value; const pm = toMins(ns)+60; const auto = `${String(Math.floor(pm/60)).padStart(2,'0')}:${String(pm%60).padStart(2,'0')}`; const slots = calendarReschedule._slots ?? []; const ends = slots.filter(t => toMins(t) > toMins(ns)); const ne = ends.includes(auto) ? auto : (ends[0] ?? ns); setCalendarReschedule(prev => ({ ...prev, newStart: ns, newEnd: ne })) }}>
                      {calendarReschedule._slots?.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-800 mb-1">End</label>
                    <select className="input w-full"
                      value={newEnd}
                      onChange={e => setCalendarReschedule(prev => ({ ...prev, newEnd: e.target.value }))}>
                      {calendarReschedule._slots?.filter(t => toMins(t) > toMins(newStart)).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={handleCalendarRescheduleSave} disabled={calendarReschedule.saving || !newDate}
                  className="btn-primary flex-1 disabled:opacity-50">
                  {calendarReschedule.saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setCalendarReschedule(null)} className="btn-secondary flex-1">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Member Activity Modal ─────────────────────────────────────────── */}
      {memberModal && (() => {
        const { member, bookings: mBookings, coaching: mCoaching, social: mSocial, coachSessions: mCoachSessions = [], balance, soloPrice, groupPrice } = memberModal
        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
               onClick={e => { if (e.target === e.currentTarget) { setMemberModal(null); setMemberModalEditId(null); setMemberModalSelected(new Set()); setMemberModalCoachingExpanded(new Set()) } }}>
            <div className="bg-gray-50 border border-gray-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[80vh] sm:max-h-[90vh] flex flex-col mb-20 sm:mb-0">
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                <div>
                  <h2 className="text-gray-900 font-medium text-lg">{member.name}</h2>
                  <p className="text-gray-800 text-sm mt-0.5">{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`badge border text-xs ${
                      member.role === 'admin' ? 'bg-gray-100 text-gray-800 border-gray-400'
                      : member.role === 'coach' ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                      {member.role}
                    </span>
                    {balance !== undefined && balance !== 0 && (
                      <span className={`badge border text-xs ${balance > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        Balance: ${balance.toFixed(2)}
                      </span>
                    )}
                    {(soloPrice != null || groupPrice != null) && !memberModalPricingForm.open && (
                      <button
                        className="badge border text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
                        onClick={() => setMemberModalPricingForm(f => ({ ...f, open: true }))}
                        title="Edit pricing"
                      >
                        {soloPrice != null ? `1-on-1 $${Number(soloPrice).toFixed(2)}` : ''}
                        {soloPrice != null && groupPrice != null ? ' · ' : ''}
                        {groupPrice != null ? `Group $${Number(groupPrice).toFixed(2)}` : ''}
                        {' ✎'}
                      </button>
                    )}
                  </div>
                  {memberModalPricingForm.open && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">1-on-1 $</span>
                        <input type="number" min="0" step="0.01" className="input text-xs py-0.5 w-20"
                          placeholder="70"
                          value={memberModalPricingForm.solo}
                          onChange={e => setMemberModalPricingForm(f => ({ ...f, solo: e.target.value }))} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">Group $</span>
                        <input type="number" min="0" step="0.01" className="input text-xs py-0.5 w-20"
                          placeholder="50"
                          value={memberModalPricingForm.group}
                          onChange={e => setMemberModalPricingForm(f => ({ ...f, group: e.target.value }))} />
                      </div>
                      <button className="btn-primary text-xs py-0.5 px-2"
                        disabled={memberModalPricingForm.saving || !memberModalPricingForm.solo || !memberModalPricingForm.group}
                        onClick={async () => {
                          setMemberModalPricingForm(f => ({ ...f, saving: true }))
                          try {
                            const { data: pd } = await coachingAPI.updateStudentPrices(member.id, {
                              solo_price: parseFloat(memberModalPricingForm.solo),
                              group_price: parseFloat(memberModalPricingForm.group),
                            })
                            setMemberModal(m => ({ ...m, soloPrice: pd.solo_price, groupPrice: pd.group_price }))
                            setMemberModalPricingForm(f => ({ ...f, saving: false, open: false }))
                          } catch {
                            setMemberModalPricingForm(f => ({ ...f, saving: false }))
                          }
                        }}>
                        {memberModalPricingForm.saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="text-xs text-gray-500 hover:text-gray-700"
                        onClick={() => setMemberModalPricingForm(f => ({ ...f, open: false }))}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={() => { setMemberModal(null); setMemberModalEditId(null); setMemberModalSelected(new Set()); setMemberModalCoachingExpanded(new Set()) }} className="text-gray-800 hover:text-gray-900 text-xl leading-none mt-1">✕</button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                {memberModalLoading ? (
                  <p className="text-gray-800 text-sm">Loading activities…</p>
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
                  const items = [...upcomingItems, ...pastItems]

                  const upcomingCoaching = mCoaching.filter(s => s.date >= today)
                  const allUpcomingSelected = upcomingCoaching.length > 0 && upcomingCoaching.every(s => memberModalSelected.has(s.id))

                  return (
                    <>
                      {/* Top bar: select all / deselect all */}
                      {upcomingCoaching.length > 1 && (
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                          <span className="text-xs text-gray-500">{upcomingCoaching.length} upcoming session{upcomingCoaching.length !== 1 ? 's' : ''}</span>
                          <button className="text-xs text-sky-500 hover:text-sky-400 font-medium"
                            onClick={() => setMemberModalSelected(allUpcomingSelected ? new Set() : new Set(upcomingCoaching.map(s => s.id)))}>
                            {allUpcomingSelected ? 'Deselect all' : 'Select all coaching'}
                          </button>
                        </div>
                      )}

                      {items.length === 0 ? (
                        <p className="text-gray-800 text-sm">No sessions.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(() => {
                            const nonCoaching = items.filter(i => i._type !== 'coaching')
                            const oneOnOneItems = items.filter(i => i._type === 'coaching' && !i.group_id)
                            const groupItems = items.filter(i => i._type === 'coaching' && i.group_id).sort((a, b) => a._date < b._date ? -1 : 1)
                            return (
                              <>
                                {nonCoaching.map(item => {
                                  if (item._type === 'booking') return (
                                    <div key={item._key} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-court">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-[10px] bg-brand-500/15 text-brand-400 px-1.5 py-0.5 rounded shrink-0">Booking</span>
                                        <span className="text-sm font-medium text-gray-900">{fmtDate(item.date)}</span>
                                        <span className="text-gray-800 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                      </div>
                                      {item._date >= today && (
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
                                        <span className="text-sm font-medium text-gray-900">{fmtDate(item.date)}</span>
                                        <span className="text-gray-800 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                        {item.notes && <span className="text-gray-800 text-xs">· {item.notes}</span>}
                                      </div>
                                      <div className="flex flex-wrap gap-2 pl-1">
                                        {item.students.map(st => (
                                          <div key={st.id} className="flex items-center gap-1.5 bg-gray-100/40 rounded px-2.5 py-1">
                                            <span className="text-xs text-gray-800">{st.name}</span>
                                            {st.checked_in
                                              ? <span className="text-[10px] text-emerald-400 font-medium">✓</span>
                                              : <span className="text-[10px] text-gray-800">—</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                  if (item._type === 'social') return (
                                    <div key={item._key} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-court">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-[10px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded shrink-0">Social</span>
                                        <span className="text-sm font-medium text-gray-900">{fmtDate(item.date)}</span>
                                        <span className="text-gray-800 text-sm">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                      </div>
                                      {item._date >= today && (
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
                                {oneOnOneItems.length > 0 && (() => {
                                  // Group sessions by recurrence_id; standalone sessions each get their own key
                                  const seriesMap = new Map()
                                  for (const item of oneOnOneItems) {
                                    const key = item.recurrence_id ?? `solo-${item.id}`
                                    if (!seriesMap.has(key)) seriesMap.set(key, [])
                                    seriesMap.get(key).push(item)
                                  }
                                  const seriesList = [...seriesMap.entries()]
                                    .map(([key, s]) => [key, [...s].sort((a, b) => a._date.localeCompare(b._date))])
                                    .sort(([, a], [, b]) => a[0]._date.localeCompare(b[0]._date))
                                  return seriesList.map(([seriesKey, sessions]) => {
                                    const isExpanded = memberModalCoachingExpanded.has(seriesKey)
                                    const coachName = sessions[0]?.coach_name
                                    const firstDate = sessions[0]?._date
                                    const lastDate  = sessions[sessions.length - 1]?._date
                                    const dateRange = sessions.length > 1
                                      ? `${fmtDate(firstDate)} – ${fmtDate(lastDate)}`
                                      : fmtDate(firstDate)
                                    return (
                                      <div key={seriesKey} className="rounded-lg border border-gray-300 overflow-hidden">
                                        <button
                                          className="w-full flex items-center justify-between px-4 py-2.5 bg-court hover:bg-gray-100/20 transition-colors"
                                          onClick={() => setMemberModalCoachingExpanded(prev => {
                                            const n = new Set(prev)
                                            n.has(seriesKey) ? n.delete(seriesKey) : n.add(seriesKey)
                                            return n
                                          })}>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Coaching</span>
                                            <span className="text-sm text-gray-800">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
                                            {coachName && <span className="text-xs text-gray-800">· {coachName}</span>}
                                            <span className="text-xs text-gray-500">{dateRange}</span>
                                          </div>
                                          <span className="text-gray-800 text-xs">{isExpanded ? '▲' : '▼'}</span>
                                        </button>
                                        {isExpanded && (
                                          <div className="border-t border-gray-200/40 divide-y divide-court-light/30">
                                            {sessions.map(item => {
                                              const isEditing  = memberModalEditId === item.id
                                              const isSelected = memberModalSelected.has(item.id)
                                              const seriesCount = item.recurrence_id
                                                ? mCoaching.filter(x => x.recurrence_id === item.recurrence_id && x.date >= today).length
                                                : 0
                                              return (
                                                <div key={item._key} className={`rounded-lg border ${isSelected ? 'border-sky-500/50 bg-sky-900/20' : 'border-transparent bg-court'}`}>
                                                  <div className="grid items-center gap-x-2 px-4 py-2.5" style={{gridTemplateColumns:'16px 54px 68px 26px 1fr auto'}}>
                                                    {item._date >= today
                                                      ? <input type="checkbox" className="accent-sky-500" checked={isSelected} onChange={e => setMemberModalSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(item.id) : n.delete(item.id); return n })} />
                                                      : <div />}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded text-center ${item.group_id ? 'bg-teal-500/15 text-teal-600' : 'bg-emerald-100 text-emerald-700'}`}>{item.group_id ? 'Group' : 'Coaching'}</span>
                                                    <span className="text-sm font-medium text-gray-900">{new Date(item.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>
                                                    <span className="text-xs text-gray-500">{new Date(item.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short'})}</span>
                                                    <span className="text-gray-800 text-sm truncate">{item.coach_name} · {fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                                    <div className="flex items-center gap-3 justify-end">
                                                      {(item.checked_in || adminCheckedIn.has(item.id))
                                                        ? item.no_show
                                                          ? <span className="text-red-400 text-xs font-medium whitespace-nowrap">✗ No Show</span>
                                                          : <span className="text-emerald-400 text-xs font-medium whitespace-nowrap">✓ Checked in</span>
                                                        : item._date < today && <span className="text-gray-400 text-xs whitespace-nowrap">Not checked in</span>}
                                                    {item._date < today && (item.review_body || item.review_skills?.length > 0 || item.student_rating) && memberModalSelected.size === 0 && (
                                                      <button
                                                        onClick={() => setMemberModalFeedbackExpanded(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })}
                                                        className="text-xs text-amber-500 hover:text-amber-400 whitespace-nowrap">
                                                        {memberModalFeedbackExpanded.has(item.id) ? 'Hide' : 'Feedback'}
                                                      </button>
                                                    )}
                                                    {item._date >= today && memberModalSelected.size === 0 && (
                                                      <div className="flex gap-3 shrink-0">
                                                        <button className={`text-xs ${isEditing ? 'text-gray-800 hover:text-gray-900' : 'text-sky-400 hover:text-sky-300'}`}
                                                          onClick={() => {
                                                            if (isEditing) { setMemberModalEditId(null) } else {
                                                              setMemberModalEditId(item.id)
                                                              setMemberModalEditForm({ date: item.date.slice(0,10), start_time: item.start_time.slice(0,5), end_time: item.end_time.slice(0,5) })
                                                            }
                                                          }}>
                                                          {isEditing ? 'Close' : 'Edit'}
                                                        </button>
                                                        <button className="text-xs text-red-400 hover:text-red-300"
                                                          onClick={() => {
                                                            if (memberModalEditId === item.id) setMemberModalEditId(null)
                                                            handleCancelSession(item.id, item)
                                                          }}>Cancel</button>
                                                      </div>
                                                    )}
                                                    </div>
                                                  </div>
                                                  {/* Feedback panel */}
                                                  {memberModalFeedbackExpanded.has(item.id) && (
                                                    <div className="px-4 pb-3 border-t border-gray-200/40 space-y-2 pt-2">
                                                      {(item.review_body || item.review_skills?.length > 0) && (
                                                        <div className="bg-sky-50 rounded-lg px-3 py-2">
                                                          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Coach feedback</p>
                                                          {item.review_skills?.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mb-1">
                                                              {item.review_skills.map(sk => (
                                                                <span key={sk} className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">{sk}</span>
                                                              ))}
                                                            </div>
                                                          )}
                                                          {item.review_body && <p className="text-xs text-gray-700 whitespace-pre-wrap">{item.review_body}</p>}
                                                        </div>
                                                      )}
                                                      {item.student_rating && (
                                                        <div className="bg-amber-50 rounded-lg px-3 py-2">
                                                          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Student rating</p>
                                                          <div className="flex items-center gap-1">
                                                            {[1,2,3,4,5].map(s => (
                                                              <span key={s} className={s <= item.student_rating ? 'text-amber-400' : 'text-gray-300'}>★</span>
                                                            ))}
                                                            <span className="text-xs text-gray-500 ml-1">{item.student_rating}/5</span>
                                                          </div>
                                                          {item.student_comment && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{item.student_comment}</p>}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                  {/* Inline edit form */}
                                                  {isEditing && memberModalSelected.size === 0 && (
                                                    <div className="px-4 pb-3 border-t border-gray-200/40 space-y-2 pt-2">
                                                      <div className="flex gap-2 flex-wrap">
                                                        <div>
                                                          <label className="block text-xs text-gray-800 mb-1">New date</label>
                                                          <input type="date" className="input text-xs py-1" value={memberModalEditForm.date}
                                                            onChange={e => setMemberModalEditForm(f => ({ ...f, date: e.target.value }))} />
                                                        </div>
                                                        <div>
                                                          <label className="block text-xs text-gray-800 mb-1">Start time</label>
                                                          <select className="input text-xs py-1" value={memberModalEditForm.start_time}
                                                            onChange={e => { const st = e.target.value; const et = st ? (ALL_SLOTS.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setMemberModalEditForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                                            <option value="">Keep same</option>
                                                            {ALL_SLOTS.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                                          </select>
                                                        </div>
                                                        <div>
                                                          <label className="block text-xs text-gray-800 mb-1">End time</label>
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
                                    )
                                  })
                                })()}
                                {groupItems.length > 0 && (
                                  <div className="rounded-lg border border-gray-300 overflow-hidden">
                                    <button
                                      className="w-full flex items-center justify-between px-4 py-2.5 bg-court hover:bg-gray-100/20 transition-colors"
                                      onClick={() => setMemberModalGroupExpanded(p => !p)}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-teal-500/15 text-teal-600 px-1.5 py-0.5 rounded">Group</span>
                                        <span className="text-sm text-gray-800">{groupItems.length} session{groupItems.length !== 1 ? 's' : ''}</span>
                                        {[...new Set(groupItems.map(i => i.coach_name).filter(Boolean))].map(n => (
                                          <span key={n} className="text-xs text-gray-800">· {n}</span>
                                        ))}
                                      </div>
                                      <span className="text-gray-800 text-xs">{memberModalGroupExpanded ? '▲' : '▼'}</span>
                                    </button>
                                    {memberModalGroupExpanded && (
                                      <div className="border-t border-gray-200/40 divide-y divide-court-light/30">
                                        {groupItems.map(item => {
                                          const isEditing = memberModalEditId === item.id
                                          const isSelected = memberModalSelected.has(item.id)
                                          return (
                                            <div key={item._key} className={`rounded-lg border ${isSelected ? 'border-sky-500/50 bg-sky-900/20' : 'border-transparent bg-court'}`}>
                                              <div className="grid items-center gap-x-2 px-4 py-2.5" style={{gridTemplateColumns:'16px 54px 68px 26px 1fr auto'}}>
                                                {item._date >= today
                                                  ? <input type="checkbox" className="accent-sky-500" checked={isSelected} onChange={e => setMemberModalSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(item.id) : n.delete(item.id); return n })} />
                                                  : <div />}
                                                <span className="text-[10px] bg-teal-500/15 text-teal-600 px-1.5 py-0.5 rounded text-center">Group</span>
                                                <span className="text-sm font-medium text-gray-900 truncate">{fmtDate(item.date)}</span>
                                                <span className="text-xs text-gray-500">{new Date(item.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short'})}</span>
                                                <span className="text-gray-800 text-sm truncate">{item.coach_name} · {fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>
                                                <div className="flex items-center gap-3 justify-end">
                                                  {(item.checked_in || adminCheckedIn.has(item.id))
                                                    ? item.no_show
                                                      ? <span className="text-red-400 text-xs font-medium whitespace-nowrap">✗ No Show</span>
                                                      : <span className="text-emerald-400 text-xs font-medium whitespace-nowrap">✓ Checked in</span>
                                                    : item._date < today && <span className="text-gray-400 text-xs whitespace-nowrap">Not checked in</span>}
                                                  {item._date < today && (item.review_body || item.review_skills?.length > 0 || item.student_rating) && memberModalSelected.size === 0 && (
                                                    <button
                                                      onClick={() => setMemberModalFeedbackExpanded(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })}
                                                      className="text-xs text-amber-500 hover:text-amber-400 whitespace-nowrap">
                                                      {memberModalFeedbackExpanded.has(item.id) ? 'Hide' : 'Feedback'}
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                              {/* Feedback panel */}
                                              {memberModalFeedbackExpanded.has(item.id) && (
                                                <div className="px-4 pb-3 border-t border-gray-200/40 space-y-2 pt-2">
                                                  {(item.review_body || item.review_skills?.length > 0) && (
                                                    <div className="bg-sky-50 rounded-lg px-3 py-2">
                                                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Coach feedback</p>
                                                      {item.review_skills?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mb-1">
                                                          {item.review_skills.map(sk => (
                                                            <span key={sk} className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">{sk}</span>
                                                          ))}
                                                        </div>
                                                      )}
                                                      {item.review_body && <p className="text-xs text-gray-700 whitespace-pre-wrap">{item.review_body}</p>}
                                                    </div>
                                                  )}
                                                  {item.student_rating && (
                                                    <div className="bg-amber-50 rounded-lg px-3 py-2">
                                                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Student rating</p>
                                                      <div className="flex items-center gap-1">
                                                        {[1,2,3,4,5].map(s => (
                                                          <span key={s} className={s <= item.student_rating ? 'text-amber-400' : 'text-gray-300'}>★</span>
                                                        ))}
                                                        <span className="text-xs text-gray-500 ml-1">{item.student_rating}/5</span>
                                                      </div>
                                                      {item.student_comment && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{item.student_comment}</p>}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
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
                      {memberModalSelected.size > 0 && (() => {
                        const selSessions = mCoaching.filter(s => memberModalSelected.has(s.id))
                        const bulkValidSlots = ALL_SLOTS.filter(sl => selSessions.every(s => {
                          const dow = new Date(s.date.slice(0,10)+'T12:00:00Z').getUTCDay()
                          return dow === 6 ? SATURDAY_SLOTS.includes(sl) : WEEKDAY_SLOTS.includes(sl)
                        }))
                        return (
                        <div className="mt-3 bg-white border border-gray-300 rounded-lg px-4 py-3 space-y-3 shadow-sm">
                          <p className="text-gray-900 text-sm font-semibold">{memberModalSelected.size} session{memberModalSelected.size > 1 ? 's' : ''} selected</p>
                          <div className="flex gap-2 flex-wrap items-end">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Shift by days</label>
                              <input type="number" className="input text-xs py-1 w-24" placeholder="0"
                                value={memberModalBulkForm.offsetDays}
                                onChange={e => setMemberModalBulkForm(f => ({ ...f, offsetDays: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">New start time</label>
                              <select className="input text-xs py-1" value={memberModalBulkForm.start_time}
                                onChange={e => { const st = e.target.value; const et = st ? (bulkValidSlots.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setMemberModalBulkForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                <option value="">Keep same</option>
                                {bulkValidSlots.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">New end time</label>
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
                                  setMemberModal(prev => ({ ...prev, coaching: prev.coaching.filter(x => !memberModalSelected.has(x.id)) }))
                                  setMemberModalSelected(new Set())
                                  setMemberModalBulkForm({ offsetDays: '0', start_time: '', end_time: '' })
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

      {/* ── Cancel + Makeup Modal ─────────────────────────────────────────── */}
      {cancelModal && (() => {
        const cm = cancelModal
        const makeupDate = (() => {
          const d = new Date(cm.lastDate + 'T12:00:00Z')
          d.setUTCDate(d.getUTCDate() + 7)
          return fmtDate(d.toISOString().slice(0, 10))
        })()
        const canMakeup = !cm.session.checked_in
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !cm.submitting) setCancelModal(null) }}>
            <div className="bg-gray-50 border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">Cancel Session</h3>
                <p className="text-sm text-gray-700 mt-1">{cm.session.student_name} · Coach: {cm.session.coach_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(cm.session.date?.slice(0, 10))} · {fmtTime(cm.session.start_time)} – {fmtTime(cm.session.end_time)}
                </p>
              </div>

              {canMakeup && (
                <label className="flex items-start gap-2.5 cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                  <input type="checkbox" className="mt-0.5 accent-blue-600" checked={cm.wantMakeup}
                    onChange={e => setCancelModal(m => ({ ...m, wantMakeup: e.target.checked }))} />
                  <div>
                    <span className="text-sm text-gray-800 font-medium">Schedule makeup session</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">After {makeupDate} · same time</p>
                  </div>
                </label>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setCancelModal(null)} disabled={cm.submitting}
                  className="btn-secondary px-4 py-2 text-sm">Keep Session</button>
                <button onClick={handleConfirmCancelModal} disabled={cm.submitting}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors">
                  {cm.submitting ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Transfer Modal ────────────────────────────────────────────────── */}
      {transferModal && (() => {
        const tm = transferModal
        const isToSolo = tm.direction === 'to-solo'
        const newPrice = isToSolo ? tm.soloPrice : tm.groupPrice
        const autoWeeks = (tm.balance != null && newPrice > 0) ? Math.max(1, Math.floor(tm.balance / newPrice)) : 1
        const usedBalance = tm.weeks * (newPrice ?? 0)
        const remaining = tm.balance != null ? tm.balance - usedBalance : null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !tm.submitting) setTransferModal(null) }}>
            <div className="bg-gray-50 border border-gray-200 rounded-xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Transfer: {isToSolo ? 'Group → 1-on-1' : '1-on-1 → Group'}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Student: {tm.studentName}</p>
                </div>
                <button onClick={() => setTransferModal(null)} disabled={tm.submitting} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>

              {/* From date */}
              <div>
                <label className="block text-xs text-gray-700 font-medium mb-1">From date</label>
                <input type="date" className="input w-full" value={tm.fromDate}
                  onChange={e => setTransferModal(m => ({ ...m, fromDate: e.target.value }))} />
              </div>

              {/* Per-student pricing */}
              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">Session pricing (this student)</p>
                {tm.soloPrice == null ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : (
                  <div className="flex gap-4">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">1-on-1 ($)</label>
                      <input type="number" min="1" step="1" className="input w-20 text-sm" value={tm.soloPrice}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          const np = isToSolo ? v : tm.groupPrice
                          const w = np > 0 && tm.balance != null ? Math.max(1, Math.floor(tm.balance / np)) : 1
                          setTransferModal(m => ({ ...m, soloPrice: v, weeks: w }))
                        }} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Group ($)</label>
                      <input type="number" min="1" step="1" className="input w-20 text-sm" value={tm.groupPrice}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          const np = isToSolo ? tm.soloPrice : v
                          const w = np > 0 && tm.balance != null ? Math.max(1, Math.floor(tm.balance / np)) : 1
                          setTransferModal(m => ({ ...m, groupPrice: v, weeks: w }))
                        }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Balance & sessions calculation */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                {tm.balance == null ? (
                  <p className="text-xs text-gray-400">Loading balance…</p>
                ) : (
                  <>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Current balance</span>
                      <span className="font-mono font-semibold">${tm.balance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>New session price</span>
                      <span className="font-mono">${(newPrice ?? 0).toFixed(0)}/session</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-xs text-gray-700 font-medium">Sessions to create</label>
                      <input type="number" min="1" step="1" className="input w-20 text-sm" value={tm.weeks}
                        onChange={e => setTransferModal(m => ({ ...m, weeks: Math.max(1, parseInt(e.target.value) || 1) }))} />
                      <span className="text-[11px] text-gray-400">(auto: {autoWeeks})</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-blue-100">
                      <span className="text-gray-600">Balance after ({tm.weeks} × ${(newPrice ?? 0).toFixed(0)})</span>
                      <span className={`font-mono font-semibold ${remaining != null && remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ${remaining != null ? remaining.toFixed(2) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Direction-specific inputs */}
              {isToSolo ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-700 font-medium mb-1">Coach</label>
                    <select className="input w-full" value={tm.coachId}
                      onChange={e => setTransferModal(m => ({ ...m, coachId: e.target.value }))}>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-700 font-medium mb-1">Start time</label>
                      <select className="input w-full" value={tm.startTime}
                        onChange={e => setTransferModal(m => ({ ...m, startTime: e.target.value }))}>
                        {TIMES.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-700 font-medium mb-1">End time</label>
                      <select className="input w-full" value={tm.endTime}
                        onChange={e => setTransferModal(m => ({ ...m, endTime: e.target.value }))}>
                        {TIMES.filter(t => t > tm.startTime).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Add to Group</label>
                  <select className="input w-full" value={tm.targetGroupId ?? ''}
                    onChange={e => setTransferModal(m => ({ ...m, targetGroupId: e.target.value || null }))}>
                    <option value="">Select a group…</option>
                    {groupSessions.map(g => (
                      <option key={g.group_id} value={g.group_id}>
                        {g.coach_name} · {fmtTime(g.start_time)}–{fmtTime(g.end_time)} ({g.student_names?.length ?? 0} students)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tm.error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{tm.error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setTransferModal(null)} disabled={tm.submitting}
                  className="btn-secondary px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={handleConfirmTransfer}
                  disabled={tm.submitting || tm.balance == null || (!isToSolo && !tm.targetGroupId)}
                  className="btn-primary px-4 py-2 text-sm">
                  {tm.submitting ? 'Transferring…' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Make Coach Modal ──────────────────────────────────────────────── */}
      {coachModal && (() => {
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl w-full max-w-md p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900">Make Coach — {coachModal.name}</h2>
                <button onClick={() => setCoachModal(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>

              {/* Start / End dates (both optional) */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-800 mb-1">Start Date (optional)</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={coachForm.availability_start}
                    onChange={e => setCoachForm(f => ({ ...f, availability_start: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-800 mb-1">End Date (optional)</label>
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
                <label className="block text-xs text-gray-800 mb-1">Bio (optional)</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  placeholder="Short coach bio…"
                  value={coachForm.bio}
                  onChange={e => setCoachForm(f => ({ ...f, bio: e.target.value }))}
                />
              </div>

              {/* Resume drag-and-drop */}
              <div>
                <label className="block text-xs text-gray-800 mb-1">Resume (PDF, optional)</label>
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
                    coachDragging ? 'border-brand-400 bg-brand-500/10' : 'border-gray-200 hover:border-slate-500'
                  }`}
                  onClick={() => document.getElementById('coach-resume-input').click()}
                >
                  {coachForm.resume ? (
                    <p className="text-sm text-emerald-400">{coachForm.resume.name}</p>
                  ) : (
                    <p className="text-sm text-gray-800">Drag & drop a PDF here, or click to browse</p>
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

        // Merge solo series by student so multi-day-per-week packages appear as one row
        function packageSeries(collapsed) {
          const map = {}
          for (const series of collapsed) {
            if (series.group_id) {
              map[series.seriesKey] = { ...series, packageKey: series.seriesKey, seriesList: [series], isGroup: true }
            } else {
              const key = `student_${series.student_id}`
              if (!map[key]) map[key] = { packageKey: key, student_id: series.student_id, student_name: series.students[0] ?? '', seriesList: [], totalCount: 0, checkedInCount: 0, isGroup: false }
              map[key].seriesList.push(series)
              map[key].totalCount += series.totalCount
              map[key].checkedInCount += series.checkedInCount
            }
          }
          return Object.values(map).map(pkg => {
            const allDates = pkg.seriesList.flatMap(s => s.dates).sort()
            return { ...pkg, firstDate: allDates[0], lastDate: allDates[allDates.length - 1] }
          })
        }
        function dayAbbr(dateStr) {
          return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T12:00:00').getDay()]
        }

        const upcoming = packageSeries(collapseSeries(coachSessions.filter(s => s.date?.slice(0, 10) >= todayISO)))
          .sort((a, b) => a.firstDate < b.firstDate ? -1 : 1)
        const past     = packageSeries(collapseSeries(coachSessions.filter(s => s.date?.slice(0, 10) <  todayISO)))
          .sort((a, b) => a.lastDate > b.lastDate ? -1 : 1)
        const tab      = coachViewExpanded.has('past') ? 'past' : 'upcoming'
        const items    = tab === 'upcoming' ? upcoming : past

        const totalStudents = [...new Set(coachSessions.map(s => s.student_id))].length

        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
               onClick={() => { setCoachViewModal(null); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}>
            <div className="bg-gray-50 border border-gray-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[80vh] sm:max-h-[90vh] flex flex-col mb-20 sm:mb-0"
                 onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                <div>
                  <h2 className="text-gray-900 font-medium text-lg">{coachViewModal.coach_name}</h2>
                  <p className="text-gray-800 text-sm mt-0.5">
                    {[coachViewModal.email, coachViewModal.phone, `${totalStudents} student${totalStudents !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button onClick={() => { setCoachViewModal(null); setCoachViewExpanded(new Set()); setCoachViewSelectedDate({}); setCoachSeriesExpanded(new Set()) }}
                  className="text-gray-800 hover:text-gray-900 text-xl leading-none mt-1">✕</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-200 px-6">
                {[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]].map(([id, label, count]) => (
                  <button key={id}
                    onClick={() => { setCoachViewExpanded(id === 'past' ? new Set(['past']) : new Set()); setCoachSeriesExpanded(new Set()) }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === id ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-800 hover:text-gray-800'
                    }`}>
                    {label}{count > 0 && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
                  </button>
                ))}
              </div>

              {/* Session list */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
                {items.length === 0 ? (
                  <p className="text-gray-800 text-sm">No {tab} sessions.</p>
                ) : items.map((pkg, i) => {
                  const pkgAllPast   = pkg.lastDate < todayISO
                  const isMultiDate  = pkg.totalCount > 1
                  const isExpandable = isMultiDate
                  const isExpanded   = coachSeriesExpanded.has(pkg.packageKey)
                  const dateLabel    = pkg.firstDate === pkg.lastDate
                    ? fmtDate(pkg.firstDate)
                    : `${fmtDate(pkg.firstDate)} – ${fmtDate(pkg.lastDate)}`
                  const nameLabel    = pkg.isGroup
                    ? pkg.seriesList[0].students.join(', ')
                    : pkg.student_name

                  return (
                    <div key={pkg.packageKey} className="border-b border-gray-200/30 last:border-0">
                      {/* Package header row */}
                      <button
                        onClick={() => {
                          if (!isExpandable) return
                          setCoachSeriesExpanded(prev => {
                            const next = new Set(prev)
                            next.has(pkg.packageKey) ? next.delete(pkg.packageKey) : next.add(pkg.packageKey)
                            return next
                          })
                        }}
                        className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-100/30 rounded-lg transition-colors px-2 -mx-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-normal uppercase tracking-wide shrink-0 ${
                          pkg.isGroup ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>{pkg.isGroup ? 'Group' : '1-on-1'}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-snug ${pkgAllPast ? 'text-gray-500' : 'text-gray-900'}`}>
                            {nameLabel}
                            {isMultiDate && <span className="text-xs font-normal text-gray-400 ml-1.5">({pkg.totalCount} sessions)</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{dateLabel}</p>
                        </div>
                        {/* Time slots — one per series */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {pkg.seriesList.map((sr, si) => (
                            <div key={si} className="flex items-center gap-1.5">
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{dayAbbr(sr.dates[0])}</span>
                              <span className="text-xs text-gray-600">{fmtTime(sr.start_time)} – {fmtTime(sr.end_time)}</span>
                            </div>
                          ))}
                        </div>
                        {tab === 'past' && (
                          pkg.checkedInCount > 0
                            ? <span className="text-emerald-500 text-xs shrink-0">✓ {pkg.checkedInCount}/{pkg.totalCount}</span>
                            : <span className="text-gray-400 text-xs shrink-0">No show</span>
                        )}
                        {isExpandable && (
                          <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        )}
                      </button>

                      {/* Expanded: per-series date rows */}
                      {isExpanded && (
                        <div className="mb-3 mx-2 rounded-lg border border-gray-100 overflow-hidden divide-y divide-gray-100">
                          {pkg.seriesList.map((sr, si) => {
                            const dateMap = {}
                            for (const r of sr.rawSessions) {
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
                              <div key={si}>
                                {pkg.seriesList.length > 1 && (
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50">
                                    <span className="text-[10px] bg-white border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-normal">{dayAbbr(sr.dates[0])}</span>
                                    <span className="text-xs text-gray-500">{fmtTime(sr.start_time)} – {fmtTime(sr.end_time)}</span>
                                  </div>
                                )}
                                {dateRows.map(dr => {
                                  const isPast = dr.date < todayISO
                                  return (
                                    <div key={dr.date} className="flex items-center gap-3 px-3 py-2">
                                      <span className={`text-xs flex-1 ${isPast ? 'text-gray-500' : 'text-gray-700'}`}>
                                        {fmtDate(dr.date)}
                                        {pkg.isGroup && <span className="text-gray-400 ml-1.5">· {dr.students.join(', ')}</span>}
                                      </span>
                                      {isPast ? (
                                        dr.checkedCount > 0
                                          ? <span className="text-emerald-500 text-xs shrink-0 font-medium">✓ Checked in{dr.checkedCount > 1 ? ` (${dr.checkedCount}/${dr.total})` : ''}</span>
                                          : <span className="text-red-400 text-xs shrink-0">No show</span>
                                      ) : (
                                        <span className="text-gray-300 text-xs shrink-0">Upcoming</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
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
            <div className="bg-gray-100 border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-6 pb-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-gray-900">Edit Sessions</h2>
                  <p className="text-xs text-gray-800 mt-0.5">
                    {s0.student_name} · Coach: {s0.coach_name} · {sorted.length} upcoming session{sorted.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setSoloEditModal(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-6">
                {sorted.length === 0 ? (
                  <p className="text-gray-800 text-sm">No upcoming sessions in this series.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm text-gray-800">Upcoming Sessions</h3>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-gray-800 hover:text-gray-900 transition-colors"
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
                            <span className="text-sm text-gray-900">{fmtDate(s.date?.slice(0, 10))}</span>
                            <span className="text-gray-800 text-xs font-mono">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                            {checkedIn && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Checked in</span>}
                            {s.notes && <span className="text-[10px] text-gray-800 truncate max-w-[160px]">{s.notes}</span>}
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

              <div className="p-4 border-t border-gray-200 shrink-0 flex justify-end">
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
            <div className="bg-gray-100 border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Fixed header */}
              <div className="p-6 pb-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-gray-900">Edit Group Session</h2>
                  <p className="text-xs text-gray-800 mt-0.5">{fmtTime(g.start_time)} – {fmtTime(g.end_time)} · Coach: {g.coach_name}</p>
                </div>
                <button onClick={() => setGroupEditModal(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {/* Sessions list */}
                {uniqueDates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm text-gray-800">Upcoming Sessions</h3>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-gray-800 hover:text-gray-900 transition-colors"
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
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded shrink-0">Group</span>
                              <span className="text-sm text-gray-900">{fmtDate(date)}</span>
                              <span className="text-gray-800 text-sm">{g.coach_name} · {fmtTime(rep.start_time)}–{fmtTime(rep.end_time)}</span>
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
                                  className={`text-xs ${isEditing ? 'text-gray-800 hover:text-gray-900' : 'text-sky-400 hover:text-sky-300'}`}
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
                            <div className="px-4 pb-2 space-y-1 border-t border-gray-200/30 pt-2">
                              {dateMap[date].map(s => {
                                const leaveCount = (g.group_leave_map ?? {})[String(s.student_id)] ?? 0
                                const leaveUsed = leaveCount >= 2
                                const sStart = s.start_time?.slice(0, 5)
                                const sEnd = s.end_time?.slice(0, 5)
                                const rescheduled = sStart !== rep.start_time?.slice(0, 5) || sEnd !== rep.end_time?.slice(0, 5)
                                return (
                                  <div key={s.id} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                      <span className="text-xs text-gray-800">{s.student_name}</span>
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
                                        className={`text-xs ${leaveUsed ? 'text-gray-800 cursor-not-allowed' : 'text-amber-400 hover:text-amber-300'}`}
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
                                          className="text-xs text-gray-800 hover:text-gray-900"
                                          onClick={() => setDateAddSearch(prev => { const n = { ...prev }; delete n[date]; return n })}>
                                          ✕
                                        </button>
                                        {search && (
                                          <ul className="w-full mt-1 divide-y divide-court-light max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-gray-100">
                                            {members
                                              .filter(m => m.name?.toLowerCase().includes(search.toLowerCase()) && !alreadyInGroup.has(m.id))
                                              .slice(0, 6)
                                              .map(m => (
                                                <li key={m.id}>
                                                  <button
                                                    disabled={dateAddSaving}
                                                    className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-100"
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
                            <div className="px-4 pb-3 border-t border-gray-200/40 space-y-2 pt-2">
                              <div className="flex gap-2 flex-wrap">
                                <div>
                                  <label className="block text-xs text-gray-800 mb-1">New date</label>
                                  <input type="date" className="input text-xs py-1" value={groupEditForm.date}
                                    onChange={e => setGroupEditForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-800 mb-1">Start time</label>
                                  <select className="input text-xs py-1" value={groupEditForm.start_time}
                                    onChange={e => { const st = e.target.value; const et = st ? (ALL_SLOTS.find(sl => toMins(sl) === toMins(st) + 60) ?? '') : ''; setGroupEditForm(f => ({ ...f, start_time: st, end_time: et })) }}>
                                    <option value="">Keep same</option>
                                    {ALL_SLOTS.map(sl => <option key={sl} value={sl}>{fmtTime(sl)}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-800 mb-1">End time</label>
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
                  <p className="text-gray-800 text-sm">No upcoming sessions.</p>
                )}
              </div>

              {/* Fixed footer */}
              <div className="p-4 border-t border-gray-200 shrink-0 flex justify-end">
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
            <div className="bg-gray-50 border border-gray-200 rounded-xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-gray-900">Reschedule Sessions</h2>
                  <p className="text-xs text-gray-800 mt-0.5">{rescheduleModal.studentName}</p>
                </div>
                <button onClick={() => setRescheduleModal(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>

              {/* Optional new time for "Move from here" */}
              <div className="bg-gray-100/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-800">New time for remaining sessions (optional — leave blank to keep current time)</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-800 block mb-1">Start time</label>
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
                    <label className="text-xs text-gray-800 block mb-1">End time</label>
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
                    <tr className="border-b border-gray-200">
                      {['', '#', 'Current Date', 'Time', 'New Date', 'Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs text-gray-800 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rescheduleModal.sessions.map((s, i) => {
                      const isPast    = s.date?.slice(0, 10) < todayISO
                      const newDate   = rescheduleDates[s.id] ?? ''
                      const isChecked = rescheduleSelected.has(s.id)
                      return (
                        <tr key={s.id} className={`border-b border-gray-200/40 last:border-0 ${isPast ? 'opacity-40' : ''} ${isChecked ? 'bg-brand-500/5' : ''}`}>
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
                          <td className="px-3 py-2.5 text-gray-800 text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="text-gray-900 text-xs font-medium">
                              {new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-gray-800 text-xs font-mono whitespace-nowrap">
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

              <div className="flex items-center justify-between pt-1 border-t border-gray-200">
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
                    className="text-xs text-gray-800 hover:text-gray-800"
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
            <div className="bg-gray-100 border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="p-5 pb-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-gray-900 text-base">Edit Social Play</h2>
                <button onClick={() => setSocialCalendarEdit(null)} className="text-gray-800 hover:text-gray-900 text-xl leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-gray-800 block mb-1">Name</label>
                  <input type="text" className="input w-full text-sm"
                    value={e.title}
                    onChange={f => setSocialCalendarEdit(prev => ({ ...prev, title: f.target.value }))} />
                </div>
                {/* Date */}
                <div>
                  <label className="text-xs text-gray-800 block mb-1">Date</label>
                  <input type="date" className="input w-full text-sm"
                    value={e.date}
                    onChange={f => setSocialCalendarEdit(prev => ({ ...prev, date: f.target.value }))} />
                </div>
                {/* Time */}
                <div>
                  <label className="text-xs text-gray-800 block mb-1">Time</label>
                  <div className="flex items-center gap-2">
                    <select className="input flex-1 text-sm"
                      value={e.start_time}
                      onChange={f => { const ns = f.target.value; setSocialCalendarEdit(prev => ({ ...prev, start_time: ns, end_time: autoEnd(ns) })) }}>
                      {allSlots.slice(0,-1).map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                    </select>
                    <span className="text-gray-800 text-xs">–</span>
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
                    <label className="text-xs text-gray-800 block mb-1">Courts</label>
                    <input type="number" min="1" max="6" className="input w-full text-sm"
                      value={e.num_courts}
                      onChange={f => setSocialCalendarEdit(prev => ({ ...prev, num_courts: f.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-800 block mb-1">Max players</label>
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
