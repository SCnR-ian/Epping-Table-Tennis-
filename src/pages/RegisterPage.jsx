import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import FormInput from '@/components/common/FormInput'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function RegisterPage() {
  const { register, loading, error, clearError } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' })
  const [errors, setErrors] = useState({})

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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-court-pattern">
      <div className="absolute inset-0 bg-gradient-to-b from-court-dark to-court-mid" />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display text-3xl text-white tracking-widest">
            SPIN<span className="text-brand-500">&</span>WIN
          </Link>
          <h1 className="font-display text-4xl text-white mt-4 tracking-wider">Join the Club</h1>
          <p className="text-slate-500 mt-2 text-sm">Create your free account today</p>
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* OAuth buttons */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold py-2.5 px-4 rounded-lg border border-slate-200 transition-all duration-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign up with Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-court-light" />
            </div>
            <div className="relative flex justify-center text-xs text-slate-500">
              <span className="bg-court-mid px-3">or register with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormInput
              id="name" name="name" label="Full Name" type="text"
              placeholder="Alex Chen" required
              value={form.name} onChange={handleChange} error={errors.name}
            />
            <FormInput
              id="email" name="email" label="Email Address" type="email"
              placeholder="you@example.com" required
              value={form.email} onChange={handleChange} error={errors.email}
            />
            <FormInput
              id="phone" name="phone" label="Phone (optional)" type="tel"
              placeholder="+61 400 000 000"
              value={form.phone} onChange={handleChange} error={errors.phone}
            />
            <FormInput
              id="password" name="password" label="Password" type="password"
              placeholder="Min. 8 characters" required
              value={form.password} onChange={handleChange} error={errors.password}
            />
            <FormInput
              id="confirmPassword" name="confirmPassword" label="Confirm Password" type="password"
              placeholder="Repeat your password" required
              value={form.confirmPassword} onChange={handleChange} error={errors.confirmPassword}
            />

            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox" id="terms" required
                className="mt-0.5 rounded border-court-light bg-court-dark text-brand-500 focus:ring-brand-500"
              />
              <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                I agree to the{' '}
                <a href="#" className="text-brand-400 hover:text-brand-300">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-brand-400 hover:text-brand-300">Privacy Policy</a>
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Creating account…
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already a member?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
