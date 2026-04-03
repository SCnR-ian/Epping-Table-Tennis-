import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { homepageAPI } from "@/api/api";

const HERO_BG = "/images/hero.jpg";

const SCHEDULE = [
  { day: "Mon", time: "4:00 – 8:30 PM" },
  { day: "Tue", time: "4:00 – 8:30 PM" },
  { day: "Wed", time: "4:00 – 8:30 PM" },
  { day: "Sat", time: "1:00 – 6:30 PM" },
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState({ membersDisplay: '—', coachingSessions: '—', socialSessions: '—' });

  useEffect(() => {
    homepageAPI.getStats().then(r => setStats(r.data)).catch(() => {})
  }, []);

  const CARD_FALLBACKS = {
    private: "/images/training/private.png",
    group: "/images/training/group.png",
    school: "/images/training/school.png",
    holiday: "/images/training/holiday.png",
  };
  const DEFAULT_CARDS = [
    { id: "private", title: "One-on-One", hasImage: false },
    { id: "group", title: "Group Session", hasImage: false },
    { id: "school", title: "School Coaching", hasImage: false },
    { id: "holiday", title: "School Holiday", hasImage: false },
  ];
  const [cards, setCards] = useState(DEFAULT_CARDS);

  useEffect(() => {
    homepageAPI
      .getCards()
      .then((r) => setCards(r.data.cards))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-white">
      {/* ── Hero ── full screen, text at bottom center ────────────────────── */}
      <section className="relative h-screen -mt-[84px] overflow-hidden">
        <img
          src={HERO_BG}
          alt="Epping Table Tennis Club"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* gradient: dark at bottom for text, slight at top for navbar */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/20" />

        {/* Text block — bottom center, LV style */}
        <div className="absolute bottom-14 left-0 right-0 text-center px-4">
          <p className="text-white/60 text-[10px] tracking-[0.4em] uppercase mb-5 font-light">
            Sydney's Premier Table Tennis Club
          </p>
          <h1 className="font-display text-white text-5xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-7 leading-none">
            Epping Table Tennis
          </h1>
          <div className="flex items-center justify-center gap-8">
            {isAuthenticated ? (
              <Link
                to="/play"
                className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors"
              >
                Join Social Play
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors"
                >
                  Join the Club
                </Link>
                <span className="text-white/20">|</span>
                <Link
                  to="/play"
                  className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors"
                >
                  Social Play
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <section className="py-14 px-6 lg:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-5xl md:text-6xl font-bold text-black mb-5 leading-tight">
            More Than Just a Club
          </h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Founded in 2015, Epping Table Tennis Club has grown into Sydney's
            premier destination for players of all levels. Whether you're
            picking up a paddle for the first time or competing at a national
            level, you'll find your place here.
          </p>
          <p className="text-gray-700 leading-relaxed mb-8">
            We offer six competition-grade courts, certified coaching, weekly
            social nights, and a vibrant tournament calendar.
          </p>
          <div className="grid grid-cols-3 gap-8 mb-8 border-t border-gray-100 pt-8">
            {[
              { value: stats.membersDisplay, label: "Members" },
              { value: "6", label: "Courts" },
              { value: stats.socialSessions, label: "Social Sessions" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="font-display text-4xl font-bold text-black">
                  {value}
                </p>
                <p className="text-gray-400 text-xs tracking-widest uppercase mt-1">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <Link
            to="/about"
            className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
          >
            Discover More
          </Link>
        </div>
      </section>

      {/* ── Full-width photo ─────────────────────────────────────────────── */}
      <div className="w-full h-screen overflow-hidden">
        <img
          src="/images/banner2.jpg"
          alt="Table tennis"
          className="w-full h-full object-cover"
        />
      </div>

      {/* ── Programs ─────────────────────────────────────────────────────── */}
      <section className="py-14 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <h2 className="font-display text-3xl md:text-4xl font-bold text-black text-center mb-10 leading-snug">
            Explore Our Training Programs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {cards.map((card) => (
              <div key={card.id} className="flex flex-col">
                {/* Photo */}
                <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden mb-4">
                  <img
                    src={
                      card.hasImage
                        ? homepageAPI.getImageUrl(card.id)
                        : CARD_FALLBACKS[card.id]
                    }
                    alt={card.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
                {/* Title — click navigates to training section */}
                <Link
                  to={`/training#${card.id}`}
                  className="text-sm font-medium text-black hover:text-gray-500 transition-colors text-center leading-snug"
                >
                  {card.title}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full-width photo 2 ───────────────────────────────────────────── */}
      <div className="w-full h-screen overflow-hidden">
        <img
          src="/images/hero.jpg"
          alt="Table tennis"
          className="w-full h-full object-cover"
        />
      </div>

      {/* ── Schedule ─────────────────────────────────────────────────────── */}
      <section className="py-12 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3">
            Opening Hours
          </p>
          <h2 className="font-display text-4xl font-bold text-black mb-8">
            Weekly Schedule
          </h2>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {SCHEDULE.map(({ day, time }) => (
              <div key={day} className="flex items-center justify-between py-5">
                <span className="font-display text-2xl font-bold text-black">
                  {day}
                </span>
                <span className="text-gray-700 text-sm tracking-wider">
                  Open Practice
                </span>
                <span className="text-gray-700 text-sm">{time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location ─────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100 py-12 px-6 lg:px-10 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3">
              Location
            </p>
            <h2 className="font-display text-4xl font-bold text-black">
              Find Us
            </h2>
          </div>
          {/* Info row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">
                Getting Here
              </p>
              <ul className="text-gray-800 text-sm space-y-1">
                <li>2 min walk from Epping Station</li>
                <li>Bus stop directly outside</li>
                <li>Free parking on-site</li>
              </ul>
            </div>
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">
                Address
              </p>
              <p className="text-gray-800 text-sm leading-relaxed">
                33 Oxford St
                <br />
                Epping NSW 2121
                <br />
                Australia
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">
                Contact
              </p>
              <p className="text-gray-800 text-sm">(02) 9876 5432</p>
              <p className="text-gray-800 text-sm mt-1">
                info@eppingttclub.com.au
              </p>
            </div>
          </div>
          {/* Map */}
          <div className="overflow-hidden h-[420px]">
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
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-12 px-6 lg:px-10 text-center border-t border-gray-100">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-500 mb-6">
          Join Us
        </p>
        <h2 className="font-display text-5xl md:text-6xl font-light tracking-wide text-black mb-6">
          Ready to Play?
        </h2>
        <p className="text-gray-700 mb-10 font-light max-w-md mx-auto leading-relaxed">
          Join hundreds of members who train, compete, and improve every week at
          Epping Table Tennis Club.
        </p>
        {isAuthenticated ? (
          <Link
            to="/play"
            className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
          >
            Join Social Play
          </Link>
        ) : (
          <div className="flex items-center justify-center gap-6">
            <Link
              to="/register"
              className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
            >
              Join the Club
            </Link>
            <Link
              to="/login"
              className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
            >
              Sign In
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
