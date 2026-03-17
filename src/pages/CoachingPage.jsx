import { Link } from 'react-router-dom'

const PROGRAMS = [
  {
    id: 'trial',
    tag: 'Try It Out',
    title: 'Trial Session',
    duration: '20 Minutes',
    price: '$10',
    icon: '🏓',
    color: 'text-sky-400',
    accent: 'bg-sky-500/10 border-sky-500/30',
    description:
      'New to table tennis? Get a taste of the game with a short introductory session. A coach will guide you through the basics — grip, stance, and your first rallies.',
    includes: [
      '1-on-1 with a qualified coach',
      'Equipment provided',
      'Basic technique introduction',
      'Perfect for complete beginners',
    ],
  },
  {
    id: 'full',
    tag: 'Most Popular',
    title: '1 Hour Full Course',
    duration: '60 Minutes',
    price: '$40',
    icon: '🎯',
    color: 'text-brand-400',
    accent: 'bg-brand-500/10 border-brand-500/30',
    description:
      'A structured one-hour coaching session tailored to your skill level. Work on footwork, spin, serves, and match strategies with personalised feedback from our coaches.',
    includes: [
      '1-on-1 personalised coaching',
      'Footwork & stroke technique',
      'Serve and return drills',
      'Video feedback available',
    ],
  },
  {
    id: 'group',
    tag: 'Great Value',
    title: 'Group Course',
    duration: '90 Minutes',
    price: '$20 / person',
    icon: '👥',
    color: 'text-emerald-400',
    accent: 'bg-emerald-500/10 border-emerald-500/30',
    description:
      'Train alongside other players in a fun, social environment. Group sessions focus on multi-ball drills, match play, and team exercises — great for improving through friendly competition.',
    includes: [
      'Small groups (max 6 players)',
      'Multi-ball training drills',
      'Match play & game scenarios',
      'Suitable for all skill levels',
    ],
  },
]

export default function CoachingPage() {
  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-4 -mt-16 bg-court-pattern text-center">
        <img src="https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=1920&q=80"
          alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-court-dark/60 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4">Professional Coaching</p>
          <h1 className="section-title text-5xl md:text-6xl mb-6">Coaching Programs</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Whether you're picking up a paddle for the first time or looking to sharpen your
            competitive edge, our qualified coaches have a program for you.
          </p>
        </div>
      </section>

      <div className="py-16 px-4 max-w-6xl mx-auto">

      {/* Program cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {PROGRAMS.map((p) => (
          <div
            key={p.id}
            className="card flex flex-col gap-5 relative overflow-hidden hover:border-court-light/80 transition-colors"
          >
            {/* Tag */}
            <span className={`absolute top-4 right-4 text-[10px] font-normal uppercase tracking-wider px-2 py-0.5 rounded-full border ${p.accent} ${p.color}`}>
              {p.tag}
            </span>

            {/* Icon + title */}
            <div>
              <span className="text-3xl">{p.icon}</span>
              <h2 className={`font-display text-2xl tracking-wider mt-2 ${p.color}`}>
                {p.title}
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">{p.duration}</p>
            </div>

            {/* Price */}
            <div>
              <span className="text-white font-normal text-3xl">{p.price}</span>
              <span className="text-slate-500 text-xs ml-1">per session</span>
            </div>

            {/* Description */}
            <p className="text-slate-400 text-sm leading-relaxed">{p.description}</p>

            {/* Includes list */}
            <ul className="space-y-2 flex-1">
              {p.includes.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              to="/booking"
              className="btn-primary text-center text-sm mt-2"
            >
              Book Now
            </Link>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="card text-center py-10 max-w-2xl mx-auto space-y-4">
        <h3 className="font-display text-2xl text-white tracking-wider">Not sure which program?</h3>
        <p className="text-slate-400 text-sm">
          Contact us and we'll help you find the right fit for your goals and experience level.
        </p>
        <a
          href="mailto:coaching@eppingttclub.com.au"
          className="btn-secondary inline-block text-sm"
        >
          Get in Touch
        </a>
      </div>
      </div>
    </div>
  )
}
