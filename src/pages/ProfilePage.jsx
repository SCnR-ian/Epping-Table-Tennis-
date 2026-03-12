import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import FormInput from '@/components/common/FormInput'
import { profileAPI, bookingsAPI } from '@/api/api'

const TABS = ['Profile', 'Bookings', 'Security', 'Preferences']

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const initialTab = new URLSearchParams(location.search).get('tab') ?? 'Profile'
  const [activeTab, setActiveTab] = useState(TABS.includes(initialTab) ? initialTab : 'Profile')
  const [form, setForm] = useState({
    name:     user?.name  ?? '',
    email:    user?.email ?? '',
    phone:    user?.phone ?? '',
    bio:      user?.bio   ?? '',
  })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved,  setPwSaved]  = useState(false)
  const [myBookings,     setMyBookings]     = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [cancelling,     setCancelling]     = useState(new Set())

  useEffect(() => {
    if (activeTab !== 'Bookings') return
    let cancelled = false
    setBookingsLoading(true)
    bookingsAPI.getMyBookings()
      .then(({ data }) => { if (!cancelled) setMyBookings(data.bookings) })
      .catch(() => { if (!cancelled) setMyBookings([]) })
      .finally(() => { if (!cancelled) setBookingsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab])

  const handleCancel = async (id) => {
    setCancelling(prev => new Set(prev).add(id))
    try {
      await bookingsAPI.cancel(id)
      setMyBookings(prev => prev.filter(b => b.id !== id))
    } catch {
      alert('Could not cancel booking. Please try again.')
    } finally {
      setCancelling(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const handlePwChange = e => setPwForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // await profileAPI.update(form)
      await new Promise(r => setTimeout(r, 600))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) { alert('Passwords do not match'); return }
    setPwSaving(true)
    try {
      // await profileAPI.changePassword({ current: pwForm.current, password: pwForm.next })
      await new Promise(r => setTimeout(r, 600))
      setPwSaved(true)
      setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSaved(false), 2500)
    } finally { setPwSaving(false) }
  }

  return (
    <div className="page-wrapper py-10 px-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-5 mb-10">
        <div className="w-20 h-20 rounded-full bg-brand-500/20 flex items-center justify-center text-3xl font-display text-brand-400">
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div>
          <h1 className="font-display text-4xl text-white tracking-wider">{user?.name ?? 'Player'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{user?.email}</p>
          <span className="badge bg-brand-500/10 text-brand-400 border border-brand-500/30 mt-2 capitalize">
            {user?.role ?? 'Member'}
          </span>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-court-light mb-8 gap-1">
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

      {/* Profile tab */}
      {activeTab === 'Profile' && (
        <form onSubmit={handleProfileSave} className="card max-w-lg space-y-5 animate-fade-in">
          <FormInput id="name"  name="name"  label="Full Name"    value={form.name}  onChange={handleChange} />
          <FormInput id="email" name="email" label="Email Address" type="email" value={form.email} onChange={handleChange} />
          <FormInput id="phone" name="phone" label="Phone"        type="tel"  value={form.phone} onChange={handleChange} />
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">Bio</label>
            <textarea
              name="bio" rows={3} value={form.bio} onChange={handleChange}
              placeholder="Tell us about your playing style…"
              className="input-field resize-none"
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Bookings tab */}
      {activeTab === 'Bookings' && (
        <div className="space-y-4 animate-fade-in">
          {bookingsLoading ? (
            <p className="text-slate-500 text-sm">Loading your bookings…</p>
          ) : myBookings.length === 0 ? (
            <div className="card max-w-lg text-center py-10 space-y-2">
              <p className="text-slate-400">You have no bookings yet.</p>
              <a href="/booking" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
                Make a booking →
              </a>
            </div>
          ) : (
            myBookings.map((b) => {
              const upcoming = new Date(b.date + 'T23:59:59') >= new Date()
              return (
                <div key={b.id} className="card max-w-lg flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="font-normal text-white truncate">{b.court_name}</p>
                    <p className="text-sm text-slate-400">{fmtDate(b.date)}</p>
                    <p className="text-sm text-slate-400">
                      {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      confirmed
                    </span>
                    {upcoming && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        disabled={cancelling.has(b.id)}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        {cancelling.has(b.id) ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'Security' && (
        <form onSubmit={handlePasswordSave} className="card max-w-lg space-y-5 animate-fade-in">
          <h2 className="font-normal text-white">Change Password</h2>
          <FormInput id="current" name="current" label="Current Password" type="password" value={pwForm.current} onChange={handlePwChange} />
          <FormInput id="next"    name="next"    label="New Password"     type="password" value={pwForm.next}    onChange={handlePwChange} />
          <FormInput id="confirm" name="confirm" label="Confirm New Password" type="password" value={pwForm.confirm} onChange={handlePwChange} />
          <button type="submit" disabled={pwSaving} className="btn-primary">
            {pwSaving ? 'Updating…' : pwSaved ? '✓ Updated' : 'Update Password'}
          </button>
        </form>
      )}

      {/* Preferences tab */}
      {activeTab === 'Preferences' && (
        <div className="card max-w-lg space-y-5 animate-fade-in">
          <h2 className="font-normal text-white">Notifications</h2>
          {[
            ['Email me about upcoming tournaments', true],
            ['Email me about booking reminders',   true],
            ['Email me about club announcements',  false],
          ].map(([label, def]) => {
            const [on, setOn] = useState(def)
            return (
              <label key={label} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-slate-300">{label}</span>
                <div
                  onClick={() => setOn(v => !v)}
                  className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${on ? 'bg-brand-500' : 'bg-court-light'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${on ? 'translate-x-5' : ''}`} />
                </div>
              </label>
            )
          })}

          <div className="pt-4 border-t border-court-light">
            <button
              onClick={logout}
              className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Sign out of all devices
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
