import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// ---- Mock data (replace with API calls later) ----------------------------
const MOCK_SCHEDULE = [
  { day: "Mon", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Tue", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Wen", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Sat", time: "1:00 – 6:30 PM", label: "Open Practice" },
];

// ---- Coaches -------------------------------------------------------------
const COACHES = [
  {
    id: 1,
    name: "David Chen",
    title: "Head Coach",
    bio: "National champion with 15+ years of coaching experience. Specialises in advanced technique and competitive play.",
    avatar: "https://placehold.co/300x300/1a1a2e/e94560?text=DC",
  },
  {
    id: 2,
    name: "Sarah Kim",
    title: "Junior Development Coach",
    bio: "Passionate about nurturing young talent. Former state representative with a gift for making the game fun and accessible.",
    avatar: "https://placehold.co/300x300/1a1a2e/e94560?text=SK",
  },
  {
    id: 3,
    name: "Marcus Liu",
    title: "Fitness & Strategy Coach",
    bio: "Sports science graduate combining physical conditioning with tactical coaching to elevate every player's game.",
    avatar: "https://placehold.co/300x300/1a1a2e/e94560?text=ML",
  },
];

// ---- Intro photos (replace src with your actual image paths) -------------
const INTRO_PHOTOS = [
  {
    src: "https://placehold.co/800x600/1a1a2e/e94560?text=Photo+1",
    alt: "Club photo 1",
  },
  {
    src: "https://placehold.co/800x600/1a1a2e/e94560?text=Photo+2",
    alt: "Club photo 2",
  },
  {
    src: "https://placehold.co/800x600/1a1a2e/e94560?text=Photo+3",
    alt: "Club photo 3",
  },
  {
    src: "https://placehold.co/800x600/1a1a2e/e94560?text=Photo+4",
    alt: "Club photo 4",
  },
  {
    src: "https://placehold.co/800x600/1a1a2e/e94560?text=Photo+5",
    alt: "Club photo 5",
  },
];

// ---- Page ----------------------------------------------------------------
export default function HomePage() {
  const [introPhoto, setIntroPhoto] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIntroPhoto((prev) => (prev + 1) % INTRO_PHOTOS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="page-wrapper">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden bg-court-pattern">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-court-dark via-court-mid/50 to-brand-900/20 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Decorative ping-pong ball */}
        <div className="absolute top-24 right-12 md:right-32 w-20 h-20 rounded-full border-2 border-brand-500/20 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/10 ball-bounce" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <p className="text-brand-400 font-semibold text-sm uppercase tracking-widest mb-4 animate-fade-in">
            Sydney's Premier Table Tennis Club
          </p>
          <h1 className="section-title text-6xl md:text-8xl lg:text-9xl leading-none mb-6 animate-slide-up">
            Epping
            <br />
            Table Tennis Club
          </h1>
          <p
            className="text-slate-400 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed animate-slide-up"
            style={{ animationDelay: "0.1s", opacity: 0 }}
          >
            World-class courts, competitive tournaments, and a community that
            lives for the game.
          </p>
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up"
            style={{ animationDelay: "0.2s", opacity: 0 }}
          >
            <Link
              to="/register"
              className="btn-primary text-base px-8 py-3 w-full sm:w-auto"
            >
              Join the Club
            </Link>
            <Link
              to="/booking"
              className="btn-outline text-base px-8 py-3 w-full sm:w-auto"
            >
              Book a Court
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-slate-600 text-xs">
          <span>Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-slate-600 to-transparent" />
        </div>
      </section>

      {/* ── Club Introduction ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-y border-court-light">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-3">
              About Us
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
            <p className="text-slate-400 leading-relaxed mb-8">
              We offer six competition-grade courts, certified coaching, weekly
              social nights, and a vibrant tournament calendar. Our community is
              what makes us special — come and experience it for yourself.
            </p>
            <div className="grid grid-cols-3 gap-6 mb-8">
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
            <Link to="/register" className="btn-primary text-sm px-6 py-2.5">
              Join Us →
            </Link>
          </div>

          {/* Rotating photos */}
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
            {INTRO_PHOTOS.map((photo, i) => (
              <img
                key={i}
                src={photo.src}
                alt={photo.alt}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
                style={{ opacity: i === introPhoto ? 1 : 0 }}
              />
            ))}
            {/* Dot indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {INTRO_PHOTOS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIntroPhoto(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === introPhoto
                      ? "bg-brand-500 w-6"
                      : "bg-white/50 w-2 hover:bg-white/80"
                  }`}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Schedule Preview ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
              Opening Hours
            </p>
            <h2 className="section-title text-4xl">Weekly Schedule</h2>
          </div>
          <Link to="/booking" className="btn-outline text-sm hidden sm:block">
            Book Now →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {MOCK_SCHEDULE.map(({ day, time, label }) => (
            <div
              key={day}
              className="card group hover:border-brand-500/40 transition-all duration-300"
            >
              <p className="font-display text-3xl text-brand-500 tracking-wider">
                {day}
              </p>
              <p className="text-white font-medium text-sm mt-2">{label}</p>
              <p className="text-slate-500 text-xs mt-1">{time}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Coaches ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-t border-court-light">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
              Expert Guidance
            </p>
            <h2 className="section-title text-4xl">Meet Our Coaches</h2>
            <p className="text-slate-400 mt-4 max-w-xl mx-auto">
              Learn from the best. Our certified coaches bring decades of
              competitive and teaching experience to every session.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {COACHES.map((coach) => (
              <div
                key={coach.id}
                className="card flex flex-col items-center text-center group hover:border-brand-500/40 transition-all duration-300"
              >
                <img
                  src={coach.avatar}
                  alt={coach.name}
                  className="w-24 h-24 rounded-full object-cover mb-4 ring-2 ring-court-light group-hover:ring-brand-500/50 transition-all duration-300"
                />
                <p className="font-display text-xl text-white tracking-wide">
                  {coach.name}
                </p>
                <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mt-1 mb-3">
                  {coach.title}
                </p>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {coach.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Find Us ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
              Location
            </p>
            <h2 className="section-title text-4xl">Find Us</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Address & details */}
            <div className="space-y-6">
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
                  Address
                </p>
                <p className="text-white font-medium">
                  Epping Table Tennis Club
                </p>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  33 Oxford St
                  <br />
                  Epping NSW 2121
                  <br />
                  Australia
                </p>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
                  Getting Here
                </p>
                <ul className="text-slate-400 text-sm space-y-2">
                  <li>🚆 2 min walk from Epping Station</li>
                  <li>🚌 Bus stop directly outside</li>
                  <li>🚗 Free parking on-site</li>
                </ul>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-semibold mb-2">
                  Contact
                </p>
                <p className="text-slate-400 text-sm">📞 (02) 9876 5432</p>
                <p className="text-slate-400 text-sm mt-1">
                  ✉️ info@eppingttclub.com.au
                </p>
              </div>
            </div>

            {/* Map embed */}
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

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/20 via-transparent to-brand-900/20 pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="section-title text-5xl mb-4">Ready to play?</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Join hundreds of members who train, compete, and improve every week
            at Spin & Win.
          </p>
          <Link to="/register" className="btn-primary text-base px-10 py-3">
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
