const STATUS_STYLES = {
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  pending:   'bg-yellow-500/10  text-yellow-400  border-yellow-500/30',
  cancelled: 'bg-red-500/10     text-red-400     border-red-500/30',
}

import { useState } from 'react'

// BookingCard – displays a single booking in dashboard/booking lists.
// Props:
//   booking: { id, court, date, time, duration, status, price }
//   onCancel: (id) => void  – optional
//   onExtend: (id, extraMins) => Promise  – optional
export default function BookingCard({ booking, onCancel, onExtend }) {
  const { id, court = 'Court 1', date, time, duration = 60, status = 'confirmed', price } = booking
  const [extending,     setExtending]     = useState(false)
  const [extendLoading, setExtendLoading] = useState(false)

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="card-hover group">
      <div className="flex items-start justify-between gap-4">
        {/* Court icon */}
        <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/20 transition-colors">
          <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-normal text-white text-sm">{court}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{formattedDate}</p>
          <p className="text-xs text-slate-400">{time} · {duration} min{price ? ` · $${price}` : ''}</p>
        </div>

        {/* Status badge */}
        <span className={`badge border ${STATUS_STYLES[status] ?? STATUS_STYLES.pending} flex-shrink-0`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>

      {/* Actions */}
      {(onCancel || onExtend) && status !== 'cancelled' && (
        <div className="mt-4 pt-4 border-t border-court-light space-y-3">
          <div className="flex gap-4">
            {onExtend && (
              <button
                onClick={() => setExtending(e => !e)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                + Add time
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(id)}
                className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                Cancel booking
              </button>
            )}
          </div>

          {extending && (
            <div className="flex gap-2 flex-wrap">
              {[30, 60, 90, 120].map(mins => (
                <button
                  key={mins}
                  disabled={extendLoading}
                  onClick={async () => {
                    setExtendLoading(true)
                    try { await onExtend(id, mins) } catch { alert('Could not extend booking.') }
                    setExtendLoading(false)
                    setExtending(false)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                >
                  +{mins} min
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
