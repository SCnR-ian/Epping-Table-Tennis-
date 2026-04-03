function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

export default function SocialPlayCard({ session, isAuthenticated, isPast = false, onJoin, onLeave }) {
  const {
    title             = 'Social Play',
    description,
    date,
    start_time,
    end_time,
    num_courts        = 1,
    max_players       = 12,
    participant_count = 0,
    online_count      = null,
    participants      = [],
    joined            = false,
  } = session

  const onlineCount = online_count ?? participant_count
  const spotsLeft   = max_players - onlineCount
  const isFull      = spotsLeft <= 0
  const fillPct     = Math.min(Math.round((onlineCount / max_players) * 100), 100)

  return (
    <div className="border border-gray-300 bg-white flex flex-col gap-4 p-6 rounded-xl hover:border-gray-500 transition-colors duration-200">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-black text-base font-normal leading-tight">{title}</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            {num_courts} court{num_courts !== 1 ? 's' : ''}
          </p>
        </div>
        <span className={`text-[10px] tracking-widest uppercase px-3 py-1 rounded-full border flex-shrink-0 ${
          isPast
            ? 'text-gray-500 border-gray-300'
            : isFull
              ? 'text-red-500 border-red-300'
              : 'text-emerald-600 border-emerald-300'
        }`}>
          {isPast ? 'Past' : isFull ? 'Full' : 'Open'}
        </span>
      </div>

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-4">
        <div>
          <p className="text-[10px] tracking-widest uppercase text-gray-600 mb-1">Date</p>
          <p className="text-sm text-black">{fmtDate(date)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-widest uppercase text-gray-600 mb-1">Time</p>
          <p className="text-sm text-black">{fmtTime(start_time)} – {fmtTime(end_time)}</p>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-gray-700 leading-relaxed">{description}</p>
      )}

      {/* Participant fill bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1.5">
          <span>{onlineCount} / {max_players} players</span>
          <span>{isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}</span>
        </div>
        <div className="h-px bg-gray-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${fillPct >= 90 ? 'bg-red-400' : 'bg-black'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Participants */}
      {isAuthenticated ? (
        participants.length > 0 ? (
          <div>
            <p className="text-[10px] tracking-widest uppercase text-gray-600 mb-2">Who's joining</p>
            <div className="flex flex-wrap gap-1.5">
              {participants.map(p => (
                <span
                  key={p.id}
                  className={`text-xs px-2.5 py-0.5 rounded-full border ${
                    joined && p.id === session.joined_user_id
                      ? 'border-black text-black'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600">No players yet — be the first!</p>
        )
      ) : (
        <p className="text-xs text-gray-600 italic">Log in to see who's joining.</p>
      )}

      {/* Join / Leave */}
      {!isPast && (
        <div className="pt-1">
          {joined ? (
            <button onClick={onLeave} className="w-full border border-gray-400 text-gray-700 text-xs tracking-widest uppercase py-2.5 hover:border-black hover:text-black transition-colors rounded-full">
              Leave Session
            </button>
          ) : (
            <button
              onClick={onJoin}
              disabled={isFull}
              className={`w-full text-xs tracking-widest uppercase py-2.5 rounded-full transition-colors ${
                isFull
                  ? 'border border-gray-300 text-gray-400 cursor-not-allowed'
                  : 'border border-black text-black hover:bg-black hover:text-white'
              }`}
            >
              {isFull ? 'Session Full' : isAuthenticated ? 'Join Session' : 'Log in to Join'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
