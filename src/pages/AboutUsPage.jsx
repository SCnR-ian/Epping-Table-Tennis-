import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { coachingAPI } from "@/api/api";

// ── Fallback coaches if API unavailable ──────────────────────────────────────
const FALLBACK_COACHES = [
  {
    id: 1,
    name: "David Chen",
    title: "Head Coach",
    bio: "National champion with 15+ years of coaching experience. Specialises in advanced technique and competitive play.",
    avatar: null,
  },
  {
    id: 2,
    name: "Sarah Kim",
    title: "Junior Development Coach",
    bio: "Passionate about nurturing young talent. Former state representative with a gift for making the game fun and accessible.",
    avatar: null,
  },
  {
    id: 3,
    name: "Marcus Liu",
    title: "Fitness & Strategy Coach",
    bio: "Sports science graduate combining physical conditioning with tactical coaching to elevate every player's game.",
    avatar: null,
  },
];

export default function AboutUsPage() {
  const [coaches, setCoaches] = useState([]);

  useEffect(() => {
    coachingAPI.getCoaches().then(({ data }) => {
      setCoaches(data.coaches?.length ? data.coaches : FALLBACK_COACHES);
    }).catch(() => setCoaches(FALLBACK_COACHES));
  }, []);

  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-32 px-4 bg-court-pattern text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-court-dark via-court-mid/50 to-brand-900/20 pointer-events-none" />
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
              We offer six competition-grade courts, certified coaching, weekly
              social nights, and a vibrant tournament calendar. Our community is
              what makes us special — come and experience it for yourself.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8">
              Our coaches hold national and state-level certifications and are
              dedicated to helping every member reach their full potential. From
              beginners learning the basics to competitive players honing
              advanced techniques, there's a program for everyone.
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
                icon: "🏆",
                title: "Excellence",
                desc: "We push every player to reach their potential through structured programs and expert coaching.",
              },
              {
                icon: "🤝",
                title: "Community",
                desc: "A welcoming environment where players of all ages and skill levels belong and grow together.",
              },
              {
                icon: "🎯",
                title: "Inclusivity",
                desc: "From school-aged beginners to seasoned competitors — everyone is welcome at Epping TT Club.",
              },
              {
                icon: "🏓",
                title: "World-Class Facilities",
                desc: "Six competition-grade courts in a purpose-built facility with modern training equipment.",
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {coaches.map((coach) => (
              <div
                key={coach.id}
                className="card flex flex-col items-center text-center group hover:border-brand-500/40 transition-all duration-300"
              >
                {coach.avatar ? (
                  <img
                    src={coach.avatar}
                    alt={coach.name}
                    className="w-24 h-24 rounded-full object-cover mb-4 ring-2 ring-court-light group-hover:ring-brand-500/50 transition-all"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-brand-500/10 border-2 border-brand-500/20 flex items-center justify-center mb-4 ring-2 ring-court-light group-hover:ring-brand-500/50 transition-all">
                    <span className="font-display text-2xl text-brand-400">
                      {coach.name?.[0] ?? "C"}
                    </span>
                  </div>
                )}
                <p className="font-display text-xl text-white tracking-wide">
                  {coach.name}
                </p>
                <p className="text-brand-500 text-xs uppercase tracking-widest font-normal mt-1 mb-3">
                  {coach.title ?? "Coach"}
                </p>
                {coach.bio && (
                  <p className="text-slate-400 text-sm leading-relaxed">{coach.bio}</p>
                )}
              </div>
            ))}
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
