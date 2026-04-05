import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export default function LoginPage() {
  const { login, loading, error, clearError } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/dashboard'

  const [form, setForm]     = useState({ identifier: '', password: '' })
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
    <div className="flex flex-col items-center px-4 py-12 max-w-xl mx-auto w-full">

      {/* Google sign in */}
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
        Continue with Google
      </button>

      <p className="text-sm text-gray-800 mb-2">
        Sign in to your account to manage your bookings.
      </p>
      <p className="text-sm text-gray-800 mb-6">
        Don't have an account?{' '}
        <Link to="/register" className="text-black underline hover:text-gray-500">Create one free.</Link>
      </p>

      {error && (
        <div className="w-full mb-4 p-3 border border-red-300 text-red-600 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>

        {/* Email or Phone */}
        <div>
          <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
            Email or Phone <span className="text-black">*</span>
          </label>
          <input
            id="identifier" name="identifier" type="text"
            placeholder="you@example.com or 0400 000 000" required
            autoComplete="username"
            value={form.identifier} onChange={handleChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
          />
          {errors.identifier && <p className="text-xs text-red-500 mt-1">{errors.identifier}</p>}
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs tracking-widest uppercase text-gray-800 mb-1.5">
            Password <span className="text-black">*</span>
          </label>
          <input
            id="password" name="password" type="password"
            placeholder="••••••••" required
            autoComplete="current-password"
            value={form.password} onChange={handleChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-black placeholder-gray-500 focus:outline-none focus:border-black transition-colors"
          />
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-gray-800 text-white rounded-full py-4 text-sm tracking-widest uppercase transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  )
}
