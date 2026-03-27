import { Link } from "react-router-dom";

// ── Fallback coaches if API unavailable ──────────────────────────────────────
const FALLBACK_COACHES = [
  {
    id: 1,
    name: "David Chen",
    title: "Head Coach",
    nationality: "AUS",
    bio: "A two-time national champion turned elite coach, David has spent over 15 years shaping Australia's top table tennis talent. His precision-focused training philosophy and deep technical knowledge have produced five Australian national representatives under his direct guidance.",
    avatar: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=800&q=80",
    stats: [
      { value: "15+", label: "Yrs Coaching" },
      { value: "2×", label: "Nat. Champion" },
      { value: "5", label: "Nat. Reps" },
    ],
    achievements: [
      "2× Australian National Singles Champion",
      "ITTF Level 3 Certified Head Coach",
      "NSW Coach of the Year — 2019 & 2021",
      "Oceania Championships — Team Manager 2022",
      "Trained 5 Australian national representatives",
      "Peak world ranking: #38 (2009)",
    ],
  },
  {
    id: 2,
    name: "Sarah Kim",
    title: "Junior Development Coach",
    nationality: "AUS",
    bio: "Former Australian U21 representative and three-time NSW State Women's Champion, Sarah brings world-class experience to every junior session. Her ability to break down complex techniques into simple, engaging lessons has made her one of the most sought-after development coaches in the country.",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=800&q=80",
    stats: [
      { value: "10+", label: "Yrs Coaching" },
      { value: "3×", label: "State Champion" },
      { value: "40+", label: "Juniors Ranked" },
    ],
    achievements: [
      "3× NSW State Women's Singles Champion",
      "ITTF Level 2 Certified Coach",
      "Australian U21 National Representative",
      "Junior Development Coach Award 2022",
      "40+ state-ranked junior players developed",
      "Peak world ranking: #112 (2015)",
    ],
  },
  {
    id: 3,
    name: "Marcus Liu",
    title: "Fitness & Strategy Coach",
    nationality: "AUS",
    bio: "Armed with a Bachelor of Sports Science and a former top-50 NSW ranking, Marcus bridges the gap between physical athleticism and tactical intelligence. His data-driven training programs have become the backbone of the club's competitive conditioning system.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80",
    stats: [
      { value: "8+", label: "Yrs Coaching" },
      { value: "Top 50", label: "NSW Peak" },
      { value: "BSc", label: "Sports Science" },
    ],
    achievements: [
      "Bachelor of Sports Science — University of Sydney",
      "ITTF Level 2 Certified Coach",
      "Certified Strength & Conditioning Specialist",
      "Former NSW top-50 ranked player",
      "Introduced video analysis program at ETTC",
      "Specialises in footwork, speed & match tactics",
    ],
  },
];

export default function AboutUsPage() {
  const coaches = FALLBACK_COACHES;

  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-32 px-4 -mt-16 bg-court-pattern text-center">
        <img src="https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=1920&q=80"
          alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-court-dark/60 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4">
            Our Story
          </p>
          <h1 className="section-title text-5xl md:text-6xl mb-6">About Us</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Sydney's premier table tennis club — built by players, for players.
          </p>
        </div>
      </section>

      {/* ── Story ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-y border-court-light">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-3">
              Who We Are
            </p>
            <h2 className="section-title text-4xl md:text-5xl mb-6">
              More Than Just a Club
            </h2>
            <p className="text-slate-400 leading-relaxed mb-4">
              Founded in 2015, Epping Table Tennis Club has grown into Sydney's
              premier destination for players of all levels. Whether you're
              picking up a paddle for the first time or competing at a national
              level, you'll find your place here.
            </p>
            <p className="text-slate-400 leading-relaxed mb-4">
              We offer six competition-grade courts in a fully air-conditioned
              facility, certified coaching, regular social play sessions, and a
              vibrant tournament calendar. Our community is what makes us
              special — come and experience it for yourself.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8">
              Our coaches include nationally accredited coaches with national
              team experience, offering both one-on-one and group coaching
              programs. From beginners learning the basics to competitive
              players honing advanced techniques, there's a program for everyone.
            </p>
            <div className="grid grid-cols-3 gap-6">
              {[
                { value: "200+", label: "Members" },
                { value: "6", label: "Courts" },
                { value: "50+", label: "Tournaments" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="font-display text-3xl text-brand-500 tracking-wider">
                    {value}
                  </p>
                  <p className="text-slate-500 text-sm mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Values */}
          <div className="space-y-4">
            {[
              {
                icon: "❄️",
                title: "Air-Conditioned Facility",
                desc: "Play in comfort year-round in our fully air-conditioned venue — no matter the weather outside.",
              },
              {
                icon: "👥",
                title: "Regular Social Play",
                desc: "Weekly social play sessions open to all members. Show up, meet the community, and enjoy the game.",
              },
              {
                icon: "🥇",
                title: "National Team Coach",
                desc: "Train under coaches with national team experience, bringing elite-level insight to every session.",
              },
              {
                icon: "🏓",
                title: "Group Coaching",
                desc: "Structured group coaching programs for all skill levels — a great way to improve fast and meet fellow players.",
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="card flex items-start gap-4 hover:border-brand-500/40 transition-all"
              >
                <span className="text-2xl mt-0.5">{icon}</span>
                <div>
                  <p className="text-white font-medium mb-1">{title}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coaches ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
              Expert Guidance
            </p>
            <h2 className="section-title text-4xl">Meet Our Coaches</h2>
            <p className="text-slate-400 mt-4 max-w-xl mx-auto">
              Learn from the best. Our certified coaches bring decades of
              competitive and teaching experience to every session.
            </p>
          </div>

          <div className="space-y-1">
            {coaches.map((coach, idx) => {
              const photoLeft = idx % 2 === 0
              return (
                <div key={coach.id} className="relative overflow-hidden bg-court-mid border border-court-light">
                  <div className={`flex flex-col lg:flex-row ${photoLeft ? '' : 'lg:flex-row-reverse'}`} style={{ minHeight: '340px' }}>

                    {/* ── Photo column ── */}
                    <div className="lg:w-[42%] relative flex-shrink-0" style={{ minHeight: '260px' }}>
                      {coach.avatar ? (
                        <img
                          src={coach.avatar}
                          alt={coach.name}
                          className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-court-dark flex items-center justify-center">
                          <span className="font-display text-8xl text-brand-400/20">{coach.name?.[0] ?? 'C'}</span>
                        </div>
                      )}
                      {/* Diagonal overlay towards content side */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: photoLeft
                            ? 'linear-gradient(to right, transparent 60%, #1e293b 100%)'
                            : 'linear-gradient(to left, transparent 60%, #1e293b 100%)',
                        }}
                      />
                      {/* Bottom fade */}
                      <div className="absolute inset-0 bg-gradient-to-t from-court-mid/80 via-transparent to-transparent" />
                    </div>

                    {/* ── Content column ── */}
                    <div className="flex-1 flex flex-col justify-center px-10 py-8 lg:px-14 lg:py-10 relative z-10">

                      {/* Role tag */}
                      <span className="text-[10px] uppercase tracking-widest text-brand-400 font-medium border border-brand-500/30 px-3 py-1 rounded-full self-start mb-4">
                        {coach.title ?? 'Coach'}
                      </span>

                      {/* Name */}
                      <h3 className="font-display text-4xl lg:text-5xl text-white tracking-wider leading-none mb-5">
                        {coach.name}
                      </h3>

                      {/* Bio */}
                      {coach.bio && (
                        <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-lg">{coach.bio}</p>
                      )}

                      {/* Achievements */}
                      {coach.achievements?.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {coach.achievements.map((a, i) => (
                            <div key={i} className="flex items-center gap-2.5">
                              <span className="w-1 h-4 bg-brand-500 rounded-full flex-shrink-0" />
                              <span className="text-xs text-slate-300">{a}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Find Us ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-t border-court-light">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
              Location
            </p>
            <h2 className="section-title text-4xl">Find Us</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="space-y-6">
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">Address</p>
                <p className="text-white font-medium">Epping Table Tennis Club</p>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  33 Oxford St<br />Epping NSW 2121<br />Australia
                </p>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">Getting Here</p>
                <ul className="text-slate-400 text-sm space-y-2">
                  <li>🚆 2 min walk from Epping Station</li>
                  <li>🚌 Bus stop directly outside</li>
                  <li>🚗 Free parking on-site</li>
                </ul>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">Contact</p>
                <p className="text-slate-400 text-sm">📞 (02) 9876 5432</p>
                <p className="text-slate-400 text-sm mt-1">✉️ info@eppingttclub.com.au</p>
              </div>
            </div>
            <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-2xl border border-court-light h-[420px]">
              <iframe
                title="Club location"
                src="https://maps.google.com/maps?q=Epping+NSW+2121+Australia&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/20 via-transparent to-brand-900/20 pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="section-title text-5xl mb-4">Ready to join?</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Become part of Epping Table Tennis Club — Sydney's most welcoming
            competitive table tennis community.
          </p>
          <Link to="/register" className="btn-primary text-base px-10 py-3">
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
