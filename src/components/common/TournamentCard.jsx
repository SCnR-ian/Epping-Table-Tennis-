import { Link } from 'react-router-dom'

const STATUS_MAP = {
  open:      { label: 'Registration Open', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  upcoming:  { label: 'Upcoming',          style: 'bg-court-accent/10 text-court-accent border-court-accent/30' },
  ongoing:   { label: 'Live',              style: 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse' },
  completed: { label: 'Completed',         style: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
}

// TournamentCard – displays a single tournament.
// Props:
//   tournament: { id, name, date, prize, status, participants, maxParticipants, format }
//   onRegister: (id) => void  – optional
export default function TournamentCard({ tournament, onRegister }) {
  const {
    id,
    name = 'Open Singles Championship',
    date,
    prize,
    status = 'open',
    participants = 0,
    maxParticipants = 32,
    format = 'Singles',
  } = tournament

  const { label, style } = STATUS_MAP[status] ?? STATUS_MAP.upcoming
  const spotsLeft = maxParticipants - participants
  const fillPct   = Math.round((participants / maxParticipants) * 100)
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long' })
    : 'TBA'

  return (
    <div className="card-hover flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-normal text-white leading-tight">{name}</h3>
          <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">{format}</p>
        </div>
        <span className={`badge border flex-shrink-0 ${style}`}>{label}</span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Date</p>
          <p className="text-slate-200 font-medium">{formattedDate}</p>
        </div>
        {prize && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Prize Pool</p>
            <p className="text-brand-400 font-normal">{prize}</p>
          </div>
        )}
      </div>

      {/* Participants bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{participants} / {maxParticipants} participants</span>
          <span>{spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}</span>
        </div>
        <div className="h-1.5 bg-court-dark rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${fillPct >= 90 ? 'bg-red-500' : 'bg-brand-500'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Link to={`/tournaments/${id}`} className="btn-secondary text-xs py-1.5 px-3 flex-1 text-center">
          Details
        </Link>
        {onRegister && status === 'open' && spotsLeft > 0 && (
          <button onClick={() => onRegister(id)} className="btn-primary text-xs py-1.5 px-3 flex-1">
            Register
          </button>
        )}
      </div>
    </div>
  )
}
