import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
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

export default function QrScanModal({ onClose }) {
  const scannerRef = useRef(null)
  const [phase, setPhase]   = useState('scanning')  // scanning | confirming | done | error
  const [token, setToken]   = useState(null)
  const [status, setStatus] = useState(null)         // venue status
  const [result, setResult] = useState(null)         // { action, time }
  const [errorMsg, setErrorMsg] = useState('')
  const [acting, setActing] = useState(false)

  // Start camera
  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    scannerRef.current = qr

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      (decoded) => {
        // Extract token from URL or use raw value
        let t = decoded
        try {
          const url = new URL(decoded)
          t = url.searchParams.get('t') || decoded
        } catch (_) { /* not a URL, use raw */ }

        try { qr.stop().catch(() => {}) } catch (_) {}
        setToken(t)
        loadStatusThenAction(t)
      },
      () => { /* frequent scan errors — ignore */ }
    ).catch((err) => {
      setErrorMsg('Camera access denied. Please allow camera permission and try again.')
      setPhase('error')
    })

    return () => { try { qr.stop().catch(() => {}) } catch (_) {} }
  }, [])

  async function loadStatusThenAction(t) {
    setPhase('confirming')
    try {
      const { data } = await venueAPI.getStatus()
      setStatus(data)
      // Auto-act: if not checked in → check in; if checked in but not out → check out
      if (!data.checked_in) {
        await doCheckIn(t)
      } else if (!data.checked_out) {
        await doCheckOut(t)
      } else {
        // Already fully done today
        setPhase('done')
        setResult({ action: 'already', checkedInAt: data.checked_in_at, checkedOutAt: data.checked_out_at })
      }
    } catch {
      setErrorMsg('Could not load your check-in status.')
      setPhase('error')
    }
  }

  async function doCheckIn(t) {
    setActing(true)
    try {
      const { data } = await venueAPI.checkIn(t)
      setResult({ action: 'in', time: data.checked_in_at })
      setPhase('done')
    } catch (err) {
      setErrorMsg(err.response?.data?.message ?? 'Check-in failed.')
      setPhase('error')
    } finally {
      setActing(false)
    }
  }

  async function doCheckOut(t) {
    setActing(true)
    try {
      const { data } = await venueAPI.checkOut(t)
      setResult({ action: 'out', time: data.checked_out_at })
      setPhase('done')
    } catch (err) {
      setErrorMsg(err.response?.data?.message ?? 'Check-out failed.')
      setPhase('error')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-sm font-medium text-gray-900">
            {phase === 'scanning' ? 'Scan Venue QR Code' : phase === 'confirming' ? 'Processing…' : phase === 'done' ? 'Done' : 'Error'}
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera viewfinder */}
        {phase === 'scanning' && (
          <div className="px-5 pb-5">
            <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '1' }}>
              <div id="qr-reader" className="w-full h-full" />
              {/* Corner guides */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-44 h-44 relative">
                  {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos, brd]) => (
                    <div key={pos} className={`absolute w-6 h-6 border-white ${brd} ${pos}`} />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400 mt-3">Point at the QR code at the venue entrance</p>
          </div>
        )}

        {/* Processing spinner */}
        {phase === 'confirming' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Checking you in…</p>
          </div>
        )}

        {/* Success */}
        {phase === 'done' && result && (
          <div className="flex flex-col items-center text-center px-6 pb-8 pt-2 gap-3">
            {result.action === 'in' && <>
              <div className="text-5xl">✅</div>
              <p className="text-xl font-semibold text-gray-900">Signed In</p>
              <p className="text-3xl font-bold text-black">{fmtTime(result.time)}</p>
              <p className="text-xs text-gray-400">Scan again when you leave to sign out.</p>
            </>}
            {result.action === 'out' && <>
              <div className="text-5xl">👋</div>
              <p className="text-xl font-semibold text-gray-900">Signed Out</p>
              <p className="text-3xl font-bold text-black">{fmtTime(result.time)}</p>
            </>}
            {result.action === 'already' && <>
              <div className="text-5xl">✔️</div>
              <p className="text-xl font-semibold text-gray-900">All done for today!</p>
              <div className="text-sm text-gray-500 space-y-1">
                <p>In: {fmtTime(result.checkedInAt)}</p>
                <p>Out: {fmtTime(result.checkedOutAt)}</p>
              </div>
            </>}
            <button onClick={onClose} className="mt-2 w-full bg-black text-white text-sm py-3 rounded-xl font-medium">
              Close
            </button>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="flex flex-col items-center text-center px-6 pb-8 pt-2 gap-4">
            <div className="text-5xl">❌</div>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 w-full">{errorMsg}</p>
            <button onClick={onClose} className="w-full bg-black text-white text-sm py-3 rounded-xl font-medium">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
