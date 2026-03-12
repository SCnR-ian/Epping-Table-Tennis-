import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import FormInput from '@/components/common/FormInput'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function LoginPage() {
  const { login, loading, error, clearError } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/dashboard'

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.identifier) e.identifier = 'Email or phone is required'
    if (!form.password)   e.password   = 'Password is required'
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
    const result = await login(form)
    if (result.success) navigate(from, { replace: true })
  }

  const handleOAuth = (provider) => {
    window.location.href = `${API_URL}/auth/${provider}`
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-court-pattern">
      <div className="absolute inset-0 bg-gradient-to-b from-court-dark to-court-mid" />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="font-display text-3xl text-white tracking-widest">
            SPIN<span className="text-brand-500">&</span>WIN
          </Link>
          <h1 className="font-display text-4xl text-white mt-4 tracking-wider">Welcome Back</h1>
          <p className="text-slate-500 mt-2 text-sm">Sign in to your account to continue</p>
        </div>

        <div className="card">
          {/* Global API error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* OAuth buttons */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-normal py-2.5 px-4 rounded-lg border border-slate-200 transition-all duration-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-court-light" />
            </div>
            <div className="relative flex justify-center text-xs text-slate-500">
              <span className="bg-court-mid px-3">or sign in with email / phone</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <FormInput
              id="identifier" name="identifier" label="Email or Phone" type="text"
              placeholder="you@example.com or 0400 000 000" required autoComplete="username"
              value={form.identifier} onChange={handleChange}
              error={errors.identifier}
            />
            <FormInput
              id="password" name="password" label="Password" type="password"
              placeholder="••••••••" required autoComplete="current-password"
              value={form.password} onChange={handleChange}
              error={errors.password}
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                <input type="checkbox" className="rounded border-court-light bg-court-dark text-brand-500 focus:ring-brand-500" />
                Remember me
              </label>
              <a href="#" className="text-brand-400 hover:text-brand-300 transition-colors">Forgot password?</a>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
