import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import api from '@/api/api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_ZH = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

const COLORS = ['#c0392b','#2980b9','#27ae60','#8e44ad','#e67e22','#1a1a1a','#16a085','#d35400']

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
}

export default function OnboardingPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [step, setStep]     = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    // step 1
    name:      '',
    address:   '',
    phone:     '',
    email:     user?.email ?? '',
    subdomain: '',
    // step 2
    color:     '#c0392b',
    logo:      null,
    // step 3
    courts:    4,
    open_days: ['Mon','Tue','Wed','Thu','Fri','Sat'],
    open_from: '14:00',
    open_to:   '22:00',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-generate subdomain from name
  const handleNameChange = (v) => {
    set('name', v)
    if (!form.subdomain || form.subdomain === slugify(form.name)) {
      set('subdomain', slugify(v))
    }
  }

  const toggleDay = (d) => {
    set('open_days', form.open_days.includes(d)
      ? form.open_days.filter(x => x !== d)
      : [...form.open_days, d]
    )
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name',      form.name)
      fd.append('address',   form.address)
      fd.append('phone',     form.phone)
      fd.append('email',     form.email)
      fd.append('subdomain', form.subdomain)
      fd.append('color',     form.color)
      fd.append('courts',    form.courts)
      fd.append('open_days', JSON.stringify(form.open_days))
      fd.append('open_from', form.open_from)
      fd.append('open_to',   form.open_to)
      if (form.logo) fd.append('logo', form.logo)

      await api.post('/clubs/register', fd)
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (isLocal) {
        setStep('done')
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const canNext1 = form.name && form.address && form.subdomain
  const canNext2 = form.color
  const canSubmit = canNext1 && canNext2 && form.courts >= 1 && form.open_days.length > 0

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col" style={{ fontFamily: '"DM Sans", sans-serif' }}>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg tracking-tight" style={{ fontFamily: '"Kanit", sans-serif' }}>Flinther</span>
        <div className="flex items-center gap-2">
          {step !== 'done' && [1,2,3].map(n => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step > n ? 'bg-gray-900 text-white' : step === n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > n ? '✓' : n}
              </div>
              {n < 3 && <div className={`w-8 h-px ${step > n ? 'bg-gray-900' : 'bg-gray-200'}`}/>}
            </div>
          ))}
        </div>
        <div className="w-24"/>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Basic info ── */}
          {step === 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-2">Step 1 of 3</p>
              <h1 className="text-3xl font-black text-gray-900 mb-1" style={{ fontFamily: '"Kanit", sans-serif' }}>
                Tell us about your club
              </h1>
              <p className="text-gray-500 text-sm mb-8">This will appear on your club's public page.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Club name <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                    placeholder="Apex Table Tennis"
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Address <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                    placeholder="123 Main St, Sydney NSW 2000"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                      placeholder="+61 2 9000 0000"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact email</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                      placeholder="info@yourclub.com"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Your club URL <span className="text-red-500">*</span></label>
                  <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden focus-within:border-gray-400 transition-colors">
                    <span className="px-4 py-3 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0">flinther.com/</span>
                    <input
                      className="flex-1 px-4 py-3 text-sm focus:outline-none bg-white"
                      placeholder="apex"
                      value={form.subdomain}
                      onChange={e => set('subdomain', slugify(e.target.value))}
                    />
                  </div>
                  {form.subdomain && (
                    <p className="text-xs text-gray-400 mt-1.5">Your club will be at <span className="text-gray-700 font-medium">{form.subdomain}.flinther.com</span></p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canNext1}
                className="mt-8 w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── Step 2: Appearance ── */}
          {step === 2 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-2">Step 2 of 3</p>
              <h1 className="text-3xl font-black text-gray-900 mb-1" style={{ fontFamily: '"Kanit", sans-serif' }}>
                Customise your look
              </h1>
              <p className="text-gray-500 text-sm mb-8">You can always change this later from your admin dashboard.</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Theme colour</label>
                  <div className="flex gap-3 flex-wrap">
                    {COLORS.map(col => (
                      <button
                        key={col}
                        onClick={() => set('color', col)}
                        className={`w-9 h-9 rounded-xl transition-all ${form.color === col ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                        style={{ background: col }}
                      />
                    ))}
                    <label className="w-9 h-9 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors text-gray-400 text-xs">
                      +
                      <input type="color" className="sr-only" value={form.color} onChange={e => set('color', e.target.value)}/>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Logo <span className="text-gray-400 font-normal">(optional)</span></label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-gray-400 transition-colors bg-white">
                    {form.logo ? (
                      <img src={URL.createObjectURL(form.logo)} alt="logo" className="h-20 w-20 object-contain rounded-xl"/>
                    ) : (
                      <div className="text-center">
                        <p className="text-2xl mb-1">🖼</p>
                        <p className="text-sm text-gray-500">Click to upload logo</p>
                        <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="sr-only" onChange={e => set('logo', e.target.files[0])}/>
                  </label>
                </div>

                {/* Preview pill */}
                <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full shrink-0" style={{ background: form.color }}/>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{form.name || 'Your Club'}</p>
                    <p className="text-xs text-gray-400">{form.subdomain || 'yourclub'}.flinther.com</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(1)} className="flex-1 py-3.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button onClick={() => setStep(3)} className="flex-1 bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-black transition-colors">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Done (local dev only) ── */}
          {step === 'done' && (
            <div className="text-center">
              <div className="text-5xl mb-6">🎉</div>
              <h1 className="text-3xl font-black text-gray-900 mb-3" style={{ fontFamily: '"Kanit", sans-serif' }}>
                Your club is live!
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                In production this would open{' '}
                <span className="text-gray-900 font-medium">{form.subdomain}.flinther.com/admin</span>.
                <br/>To access it locally, update your frontend <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env</code>:
              </p>
              <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl px-6 py-4 text-left mb-8">
                VITE_CLUB_SUBDOMAIN={form.subdomain}
              </div>
              <p className="text-xs text-gray-400">Then save the file — Vite will reload automatically.</p>
            </div>
          )}

          {/* ── Step 3: Venue setup ── */}
          {step === 3 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-2">Step 3 of 3</p>
              <h1 className="text-3xl font-black text-gray-900 mb-1" style={{ fontFamily: '"Kanit", sans-serif' }}>
                Set up your venue
              </h1>
              <p className="text-gray-500 text-sm mb-8">Configure courts and opening hours.</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Number of courts</label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => set('courts', Math.max(1, form.courts - 1))}
                      className="w-10 h-10 rounded-xl border border-gray-200 text-gray-600 text-xl hover:bg-gray-50 transition-colors font-bold"
                    >−</button>
                    <span className="text-2xl font-black w-8 text-center" style={{ fontFamily: '"Kanit", sans-serif' }}>{form.courts}</span>
                    <button
                      onClick={() => set('courts', form.courts + 1)}
                      className="w-10 h-10 rounded-xl border border-gray-200 text-gray-600 text-xl hover:bg-gray-50 transition-colors font-bold"
                    >+</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Open days</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                          form.open_days.includes(d)
                            ? 'bg-gray-900 text-white'
                            : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
                        }`}
                      >
                        {DAYS_ZH[i]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Opening hours</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={form.open_from}
                      onChange={e => set('open_from', e.target.value)}
                      className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                    />
                    <span className="text-gray-400 text-sm">to</span>
                    <input
                      type="time"
                      value={form.open_to}
                      onChange={e => set('open_to', e.target.value)}
                      className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</p>
              )}

              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(2)} className="flex-1 py-3.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit || saving}
                  className="flex-1 bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Launching…' : '🚀 Launch my club'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
