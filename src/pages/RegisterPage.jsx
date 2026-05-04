import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useClub } from '@/context/ClubContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function RegisterPage() {
  const { register, loading, error, clearError } = useAuth()
  const { club } = useClub()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' })
  const [errors, setErrors] = useState({})

  const [installPrompt, setInstallPrompt] = useState(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isInstalled()) { setInstalled(true); return }
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (isIOS()) { setShowIOSHint(h => !h); return }
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  const validate = () => {
    const e = {}
    if (!form.name)    e.name    = 'Full name is required'
    if (!form.email)   e.email   = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email address'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    return e
  }

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    clearError()
    setErrors(er => ({ ...er, [e.target.name]: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const v = validate()
    if (Object.keys(v).length) { setErrors(v); return }
    const { confirmPassword, ...payload } = form
    const result = await register(payload)
    if (result.success) navigate('/dashboard')
  }

  const handleOAuth = (provider) => {
    window.location.href = `${API_URL}/auth/${provider}`
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Top bar */}
      <div className="border-b border-gray-200 px-8 py-4 flex items-center gap-4">
        <Link to="/" className="text-xs tracking-[0.3em] uppercase text-black font-normal">
          {club?.name ?? 'Table Tennis Club'}
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-xs tracking-[0.3em] uppercase text-gray-500">Account Creation</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-12 max-w-xl mx-auto w-full">

        {/* Google sign up */}
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-full py-3.5 text-sm text-gray-800 hover:border-black transition-colors mb-8"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign up with Google
        </button>

        <p className="text-sm text-gray-800 mb-2">
          Create your account to join sessions and manage your bookings.
        </p>
        <p className="text-sm text-gray-800 mb-6">
          Already have an account?{' '}
          <Link to="/login" className="text-black underline hover:text-gray-500">Log in here.</Link>
        </p>

        <p className="text-xs text-gray-700 self-end mb-6">Required fields *</p>

        {error && (
          <div className="w-full mb-4 p-3 border border-red-300 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>

          {/* Name */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
              Full Name <span className="text-black">*</span>
            </label>
            <input
              id="name" name="name" type="text"
              placeholder="Alex Chen" required
              value={form.name} onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
              Email Address <span className="text-black">*</span>
            </label>
            <input
              id="email" name="email" type="email"
              placeholder="you@example.com" required
              value={form.email} onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
              Phone Number
            </label>
            <input
              id="phone" name="phone" type="tel"
              placeholder="+61 400 000 000"
              value={form.phone} onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
              Password <span className="text-black">*</span>
            </label>
            <input
              id="password" name="password" type="password"
              placeholder="Min. 8 characters" required
              value={form.password} onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
            />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
              Confirm Password <span className="text-black">*</span>
            </label>
            <input
              id="confirmPassword" name="confirmPassword" type="password"
              placeholder="Repeat your password" required
              value={form.confirmPassword} onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
            />
            {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3 pt-2">
            <input
              type="checkbox" id="terms" required
              className="mt-0.5 border-gray-300 text-black focus:ring-black"
            />
            <label htmlFor="terms" className="text-xs text-gray-700 leading-relaxed cursor-pointer">
              I have read, understood and agree to the{' '}
              <a href="#" className="underline text-black hover:text-gray-500">Privacy Policy</a>. *
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-800 text-white rounded-full py-4 text-sm tracking-widest uppercase transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Continue'}
            </button>
          </div>

          {!installed && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleInstall}
                className="w-full border border-black rounded-full py-4 text-sm tracking-widest uppercase transition-colors hover:bg-gray-50"
              >
                Install App
              </button>
              {showIOSHint && (
                <div className="mt-3 p-4 bg-gray-50 rounded-2xl text-xs text-gray-600 leading-relaxed text-center">
                  Tap the <strong>Share</strong> button{' '}
                  <span className="inline-block">⎋</span> at the bottom of Safari,
                  then tap <strong>"Add to Home Screen"</strong>.
                </div>
              )}
            </div>
          )}

        </form>
      </div>
    </div>
  )
}
