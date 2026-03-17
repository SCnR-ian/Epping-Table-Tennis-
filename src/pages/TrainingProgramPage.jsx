import { Link } from "react-router-dom";

const PROGRAMS = [
  {
    id: "private",
    icon: "🎯",
    label: "Private Coaching",
    tagline: "One-on-one with an expert coach",
    color: "brand",
    description:
      "Personalised sessions tailored entirely to your game. Your coach will identify weaknesses, refine technique, and design a development plan that gets you to your goals faster than group training.",
    features: [
      "1-on-1 attention from a certified coach",
      "Customised training plan & drills",
      "Video analysis on request",
      "Flexible scheduling — book online anytime",
      "Suitable for all skill levels",
    ],
    cta: { label: "Book Private Sessions", to: "/play" },
  },
  {
    id: "group",
    icon: "👥",
    label: "Group Coaching",
    tagline: "Learn together, improve together",
    color: "emerald",
    description:
      "Small-group sessions (max 6 players) led by our coaches. A great way to build skills in a social setting, benefit from shared drills, and enjoy healthy competition with peers at a similar level.",
    features: [
      "Groups of 2–6 players per coach",
      "Structured skill progressions",
      "Multi-ball drill stations",
      "Competitive match play included",
      "Beginner, intermediate & advanced groups",
    ],
    cta: { label: "Enquire About Groups", to: "/play" },
  },
  {
    id: "school",
    icon: "🏫",
    label: "School Coaching",
    tagline: "Bringing table tennis to the classroom",
    color: "sky",
    description:
      "We partner with local schools to deliver table tennis as part of their sport and PE programs. Our coaches visit your school with portable equipment or host excursions to our facility.",
    features: [
      "Curriculum-aligned programs",
      "On-site school visits available",
      "Full equipment provided",
      "Certified coaches with Working with Children Checks",
      "Suitable for primary & secondary schools",
    ],
    cta: { label: "Contact Us for Schools", to: "/about" },
  },
  {
    id: "holiday",
    icon: "☀️",
    label: "Holiday Coaching",
    tagline: "School holidays sorted",
    color: "amber",
    description:
      "Fun, intensive programs during school holidays for juniors aged 7–17. Full-day and half-day options available. Players learn fundamentals, compete in mini-tournaments, and make new friends.",
    features: [
      "Half-day & full-day sessions",
      "Ages 7–17 welcome",
      "Mini-tournaments & friendly matches",
      "All equipment supplied",
      "Limited spots — book early",
    ],
    cta: { label: "View Holiday Dates", to: "/play" },
  },
];

const COLOR_MAP = {
  brand:   { ring: "ring-brand-500/50",   bg: "bg-brand-500/10",   text: "text-brand-400",   badge: "bg-brand-500/15 text-brand-300"   },
  emerald: { ring: "ring-emerald-500/50", bg: "bg-emerald-500/10", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300" },
  sky:     { ring: "ring-sky-500/50",     bg: "bg-sky-500/10",     text: "text-sky-400",     badge: "bg-sky-500/15 text-sky-300"         },
  amber:   { ring: "ring-amber-500/50",   bg: "bg-amber-500/10",   text: "text-amber-400",   badge: "bg-amber-500/15 text-amber-300"     },
};

export default function TrainingProgramPage() {
  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-32 px-4 -mt-16 bg-court-pattern text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-court-dark via-court-mid/50 to-brand-900/20 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4">
            Develop Your Game
          </p>
          <h1 className="section-title text-5xl md:text-6xl mb-6">
            Training Programs
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            From beginner to competitive — we have a program designed for every
            stage of your journey.
          </p>
        </div>
      </section>

      {/* ── Programs ────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto space-y-12">
          {PROGRAMS.map((prog, idx) => {
            const c = COLOR_MAP[prog.color];
            const flip = idx % 2 === 1;
            return (
              <div
                key={prog.id}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center ${flip ? "lg:[direction:rtl]" : ""}`}
              >
                {/* Icon card */}
                <div className={`[direction:ltr] flex flex-col items-center justify-center rounded-2xl border border-court-light bg-court-mid p-12 ${c.ring} ring-1 min-h-[280px]`}>
                  <span className="text-7xl mb-6">{prog.icon}</span>
                  <p className={`font-display text-2xl tracking-wide mb-2 ${c.text}`}>
                    {prog.label}
                  </p>
                  <p className="text-slate-400 text-sm text-center">{prog.tagline}</p>
                </div>

                {/* Details */}
                <div className="[direction:ltr]">
                  <p className={`text-xs uppercase tracking-widest font-normal mb-2 ${c.text}`}>
                    {prog.label}
                  </p>
                  <h2 className="section-title text-3xl md:text-4xl mb-4">
                    {prog.tagline}
                  </h2>
                  <p className="text-slate-400 leading-relaxed mb-6">
                    {prog.description}
                  </p>
                  <ul className="space-y-2 mb-8">
                    {prog.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className={`mt-0.5 text-base ${c.text}`}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={prog.cta.to}
                    className="btn-primary text-sm px-6 py-2.5 inline-block"
                  >
                    {prog.cta.label} →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 text-center bg-court-mid border-t border-court-light relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/20 via-transparent to-brand-900/20 pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="section-title text-5xl mb-4">Not sure where to start?</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Reach out and one of our coaches will help you find the right
            program based on your age, skill level, and goals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn-primary text-base px-8 py-3">
              Join the Club
            </Link>
            <Link to="/about" className="btn-outline text-base px-8 py-3">
              Meet the Coaches
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
