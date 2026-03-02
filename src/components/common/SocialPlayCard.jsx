function fmtDate(d) {
  // Append noon to avoid timezone-shifting the date
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

// SocialPlayCard
// Props:
//   session          – { id, title, description, date, start_time, end_time,
//                        court_name, max_players, participant_count,
//                        participants: [{ id, name }], joined }
//   isAuthenticated  – boolean
//   onJoin           – () => void
//   onLeave          – () => void
export default function SocialPlayCard({ session, isAuthenticated, onJoin, onLeave }) {
  const {
    title          = 'Social Play',
    description,
    date,
    start_time,
    end_time,
    court_name,
    max_players    = 12,
    participant_count = 0,
    participants   = [],
    joined         = false,
  } = session

  const spotsLeft = max_players - participant_count
  const isFull    = spotsLeft <= 0
  const fillPct   = Math.min(Math.round((participant_count / max_players) * 100), 100)

  return (
    <div className="card-hover flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white leading-tight">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{court_name}</p>
        </div>
        <span className={`badge border flex-shrink-0 ${
          isFull
            ? 'bg-red-500/10 text-red-400 border-red-500/30'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        }`}>
          {isFull ? 'Full' : 'Open'}
        </span>
      </div>

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Date</p>
          <p className="text-slate-200 font-medium">{fmtDate(date)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Time</p>
          <p className="text-slate-200 font-medium">{fmtTime(start_time)} – {fmtTime(end_time)}</p>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      )}

      {/* Participant fill bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{participant_count} / {max_players} players</span>
          <span>{isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}</span>
        </div>
        <div className="h-1.5 bg-court-dark rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${fillPct >= 90 ? 'bg-red-500' : 'bg-brand-500'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Participant names — visible only when logged in */}
      {isAuthenticated ? (
        participants.length > 0 ? (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Who's joining</p>
            <div className="flex flex-wrap gap-1.5">
              {participants.map(p => (
                <span
                  key={p.id}
                  className={`text-xs rounded-full px-2.5 py-0.5 ${
                    joined && p.id === session.joined_user_id
                      ? 'bg-brand-500/20 text-brand-300'
                      : 'bg-court-light text-slate-300'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600">No players yet — be the first!</p>
        )
      ) : (
        <p className="text-xs text-slate-600 italic">Log in to see who's joining.</p>
      )}

      {/* Join / Leave */}
      <div className="pt-1">
        {joined ? (
          <button onClick={onLeave} className="btn-secondary w-full text-sm py-2">
            Leave Session
          </button>
        ) : (
          <button
            onClick={onJoin}
            disabled={isFull}
            className={`w-full text-sm py-2 ${
              isFull ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'
            }`}
          >
            {isFull ? 'Session Full' : isAuthenticated ? 'Join Session' : 'Log in to Join'}
          </button>
        )}
      </div>

    </div>
  )
}
