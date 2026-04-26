import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '@/api/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) { setError('Please enter your email.'); return }
    setLoading(true)
    setError('')
    try {
      await authAPI.forgotPassword(email)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-normal tracking-wide text-black mb-2">
          Forgot your password?
        </h1>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              If an account exists for <strong>{email}</strong>, we've sent a reset link. Check your inbox.
            </p>
            <Link to="/" className="block text-sm text-black underline underline-offset-4 hover:text-gray-500 transition-colors">
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-8">
              Enter your email and we'll send you a link to reset your password.
            </p>

            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs tracking-widest uppercase text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-full px-5 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black hover:bg-gray-800 text-white py-3.5 rounded-full text-sm tracking-widest uppercase transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-400 text-center">
              Remember it?{' '}
              <Link to="/" className="text-black underline underline-offset-4 hover:text-gray-500 transition-colors">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
