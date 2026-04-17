import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { venueAPI } from '@/api/api'

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function fmtDateFull(iso) {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ScanPage() {
  const [params]  = useSearchParams()
  const token     = params.get('t') ?? ''

  const [status,  setStatus]  = useState(null)   // { checked_in, checked_out, checked_in_at, checked_out_at }
  const [loading, setLoading] = useState(true)
  const [acting,  setActing]  = useState(false)
  const [done,    setDone]    = useState(null)    // { action: 'in'|'out', time: iso }
  const [error,   setError]   = useState('')

  useEffect(() => {
    venueAPI.getStatus()
      .then(({ data }) => setStatus(data))
      .catch(() => setError('Could not load status.'))
      .finally(() => setLoading(false))
  }, [])

  const handleAction = async (action) => {
    setActing(true)
    setError('')
    try {
      if (action === 'in') {
        const { data } = await venueAPI.checkIn(token)
        setDone({ action: 'in', time: data.checked_in_at })
        setStatus(s => ({ ...s, checked_in: true, checked_in_at: data.checked_in_at }))
      } else {
        const { data } = await venueAPI.checkOut(token)
        setDone({ action: 'out', time: data.checked_out_at })
        setStatus(s => ({ ...s, checked_out: true, checked_out_at: data.checked_out_at }))
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Something went wrong.')
    } finally {
      setActing(false)
    }
  }

  const today = fmtDateFull()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center space-y-6">

        {/* Logo / Club name */}
        <div>
          <div className="text-3xl mb-2">🏓</div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">TT Club</p>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && !done && (
          <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Success state */}
        {done && (
          <div className="space-y-3">
            <div className="text-5xl">{done.action === 'in' ? '✅' : '👋'}</div>
            <p className="text-xl font-semibold text-gray-900">
              {done.action === 'in' ? 'Signed In' : 'Signed Out'}
            </p>
            <p className="text-2xl font-bold text-black">{fmtTime(done.time)}</p>
            <p className="text-sm text-gray-500">{fmtDateFull(done.time)}</p>
            {done.action === 'in' && (
              <p className="text-xs text-gray-400 mt-2">
                Scan again when you leave to sign out.
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!loading && !done && status && (
          <div className="space-y-3">
            {!status.checked_in && (
              <>
                <p className="text-gray-700 font-medium">Ready to sign in?</p>
                <button
                  disabled={acting}
                  onClick={() => handleAction('in')}
                  className="w-full py-4 rounded-2xl bg-black text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform">
                  {acting ? 'Signing in…' : '✅ Sign In'}
                </button>
              </>
            )}

            {status.checked_in && !status.checked_out && (
              <>
                <div className="bg-emerald-50 rounded-xl px-4 py-3">
                  <p className="text-sm text-emerald-700 font-medium">Signed in at {fmtTime(status.checked_in_at)}</p>
                </div>
                <p className="text-gray-700 font-medium">Leaving now?</p>
                <button
                  disabled={acting}
                  onClick={() => handleAction('out')}
                  className="w-full py-4 rounded-2xl bg-black text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform">
                  {acting ? 'Signing out…' : '👋 Sign Out'}
                </button>
              </>
            )}

            {status.checked_in && status.checked_out && (
              <div className="space-y-2">
                <div className="text-4xl">✔️</div>
                <p className="text-gray-700 font-medium">All done for today!</p>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>In: {fmtTime(status.checked_in_at)}</p>
                  <p>Out: {fmtTime(status.checked_out_at)}</p>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
