import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

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
            className="text-slate-600 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed animate-slide-up"
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
      <section className="py-20 px-4 bg-slate-100 border-y border-slate-200">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-3">
              About Us
            </p>
            <h2 className="section-title text-4xl md:text-5xl mb-6">
              More Than Just a Club
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              Founded in 2015, Epping Table Tennis Club has grown into Sydney's
              premier destination for players of all levels. Whether you're
              picking up a paddle for the first time or competing at a national
              level, you'll find your place here.
            </p>
            <p className="text-slate-600 leading-relaxed mb-8">
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
            <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
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
              <p className="text-slate-900 font-medium text-sm mt-2">{label}</p>
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
                <p className="text-slate-900 font-medium">
                  Epping Table Tennis Club
                </p>
                <p className="text-slate-600 text-sm mt-1 leading-relaxed">
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
                <ul className="text-slate-600 text-sm space-y-2">
                  <li>🚆 2 min walk from Epping Station</li>
                  <li>🚌 Bus stop directly outside</li>
                  <li>🚗 Free parking on-site</li>
                </ul>
              </div>
              <div className="card">
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mb-2">
                  Contact
                </p>
                <p className="text-slate-600 text-sm">📞 (02) 9876 5432</p>
                <p className="text-slate-600 text-sm mt-1">
                  ✉️ info@eppingttclub.com.au
                </p>
              </div>
            </div>

            {/* Map embed */}
            <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-2xl border border-slate-200 h-[420px]">
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
      <section className="py-24 px-4 text-center relative overflow-hidden bg-brand-500">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-600/30 via-transparent to-brand-600/30 pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="section-title text-5xl text-white mb-4">Ready to play?</h2>
          <p className="text-white/80 mb-8 leading-relaxed">
            Join hundreds of members who train, compete, and improve every week
            at Epping Table Tennis Club.
          </p>
          <Link to="/register" className="bg-white text-brand-600 hover:bg-slate-100 font-normal text-base px-10 py-3 rounded-lg transition-all inline-block">
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
