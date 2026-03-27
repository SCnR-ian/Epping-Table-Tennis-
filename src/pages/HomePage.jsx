import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// ---- Mock data (replace with API calls later) ----------------------------
const MOCK_SCHEDULE = [
  { day: "Mon", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Tue", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Wen", time: "4:00 – 8:30 PM", label: "Open Practice" },
  { day: "Sat", time: "1:00 – 6:30 PM", label: "Open Practice" },
];

// ---- Hero background photo ------------------------------------------------
const HERO_BG = "https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=1920&q=80";

// ---- Intro photos (replace src with your actual image paths) -------------
const INTRO_PHOTOS = [
  { src: "https://images.unsplash.com/photo-1611251126112-a44b3e2c6f16?auto=format&fit=crop&w=800&q=80", alt: "Club training session" },
  { src: "https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=800&q=80", alt: "Table tennis paddle and ball" },
  { src: "https://images.unsplash.com/photo-1628891890467-b79f2c8ba9dc?auto=format&fit=crop&w=800&q=80", alt: "Competitive match" },
  { src: "https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=800&q=80", alt: "Training session" },
  { src: "https://images.unsplash.com/photo-1620326740460-648e8d0af594?auto=format&fit=crop&w=800&q=80", alt: "Social play night" },
];

// ---- Page ----------------------------------------------------------------
export default function HomePage() {
  const [introPhoto, setIntroPhoto] = useState(0);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const id = setInterval(() => {
      setIntroPhoto((prev) => (prev + 1) % INTRO_PHOTOS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="page-wrapper">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] -mt-16 flex items-center justify-center overflow-hidden bg-court-pattern">
        {/* Background photo */}
        <img
          src={HERO_BG}
          alt="Epping Table Tennis Club"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Decorative ping-pong ball */}
        <div className="absolute top-24 right-12 md:right-32 w-20 h-20 rounded-full border-2 border-brand-500/20 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/10 ball-bounce" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.8)' }}>
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4 animate-fade-in">
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
            {isAuthenticated ? (
              <>
                <Link to="/play" className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
                  Book a Court
                </Link>
                <Link to="/play" className="btn-outline text-base px-8 py-3 w-full sm:w-auto">
                  Join Social Play
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
                  Join the Club
                </Link>
                <Link to="/play" className="btn-outline text-base px-8 py-3 w-full sm:w-auto">
                  Book a Court
                </Link>
              </>
            )}
          </div>
        </div>


      </section>

      {/* ── Club Introduction ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-y border-court-light">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-3">
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
            <Link to="/about" className="btn-primary text-sm px-6 py-2.5">
              About Us →
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

      {/* ── Programs & Play overview ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-court-mid border-y border-court-light">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">What We Offer</p>
            <h2 className="section-title text-4xl">Get Involved</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Training Programs card */}
            <div className="card flex flex-col gap-4 hover:border-brand-500/40 transition-all duration-300">
              <div className="relative rounded-xl overflow-hidden h-48">
                <img
                  src="https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=800&q=80"
                  alt="Training Programs"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-court-dark/50" />
                <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-brand-400 font-medium bg-court-dark/70 px-2 py-1 rounded-full">
                  Training
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-2xl text-white tracking-wider mb-2">Training Programs</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  From beginner fundamentals to advanced competitive coaching — our structured programs are designed for every stage of your journey. Train with certified coaches on competition-grade courts.
                </p>
              </div>
              <Link to="/training" className="btn-outline text-sm self-start">
                View Programs →
              </Link>
            </div>

            {/* Play card */}
            <div className="card flex flex-col gap-4 hover:border-brand-500/40 transition-all duration-300">
              <div className="relative rounded-xl overflow-hidden h-48">
                <img
                  src="https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=800&q=80"
                  alt="Book & Play"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-court-dark/50" />
                <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-brand-400 font-medium bg-court-dark/70 px-2 py-1 rounded-full">
                  Play
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-2xl text-white tracking-wider mb-2">Book a Court & Social Play</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Reserve a court for a private session, or join one of our weekly social play nights. Open to all members — just show up, play, and meet the community.
                </p>
              </div>
              <Link to="/play" className="btn-outline text-sm self-start">
                Start Playing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Schedule Preview ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
            Opening Hours
          </p>
          <h2 className="section-title text-4xl">Weekly Schedule</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
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

      {/* ── Find Us ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
              Location
            </p>
            <h2 className="section-title text-4xl">Find Us</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Address & details */}
            <div className="space-y-6">
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
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
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
                  Getting Here
                </p>
                <ul className="text-slate-400 text-sm space-y-2">
                  <li>🚆 2 min walk from Epping Station</li>
                  <li>🚌 Bus stop directly outside</li>
                  <li>🚗 Free parking on-site</li>
                </ul>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
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
            at Epping Table Tennis Club.
          </p>
          {isAuthenticated ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/play" className="btn-primary text-base px-10 py-3">
                Book a Court
              </Link>
              <Link to="/play" className="btn-outline text-base px-10 py-3">
                Join Social Play
              </Link>
            </div>
          ) : (
            <Link to="/register" className="btn-primary text-base px-10 py-3">
              Get Started Free
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
