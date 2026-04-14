import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { homepageAPI, pagesAPI } from "@/api/api";

const BANNER_IMAGES = [
  "/images/ETTC1.jpg",
  "/images/ETTC2.jpg",
  "/images/ETTC3.jpg",
  "/images/ETTC4.jpg",
  "/images/ETTC5.jpg",
  "/images/ETTC6.jpg",
]

function BannerSlideshow({ className = "" }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setCurrent(i => (i + 1) % BANNER_IMAGES.length), 4000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {BANNER_IMAGES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt="Epping Table Tennis"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === current ? 1 : 0 }}
        />
      ))}
    </div>
  )
}

const DEFAULT_STORY = {
  headline: 'More Than Just a Club',
  body1: 'Founded in 2025 and located at 33 Oxford St, Epping NSW, Epping Table Tennis Club was born out of a shared passion for the sport and a vision to create a home for players of every level in Sydney\'s north-west. From our first session, we have welcomed beginners picking up a paddle for the very first time alongside seasoned competitors chasing their next ranking point.',
  body2: 'Situated just two minutes from Epping Station, our fully air-conditioned venue houses six competition-grade courts, professional coaching programs, weekly social play nights, and a growing tournament calendar. Whether you are here to compete, improve, or simply enjoy the game in great company, you will find your place at Epping Table Tennis Club.',
}
const DEFAULT_COACHING = {
  headline: 'World-Class Coaching',
  body1: 'Our nationally accredited coaches bring decades of competitive and teaching experience to every session. From complete beginners to competitive players, we have a program tailored for you.',
  body2: 'One-on-one, group, school, and holiday programs are available across the week, led by coaches with national team experience.',
}
const DEFAULT_COACHES = [
  {
    name: "David Chen",
    title: "Head Coach",
    bio: "A two-time national champion turned elite coach, David has spent over 15 years shaping Australia's top table tennis talent. His precision-focused training philosophy and deep technical knowledge have produced five Australian national representatives under his direct guidance.",
    fallbackImage: "/images/coach-4.jpg",
  },
  {
    name: "Sarah Kim",
    title: "Junior Development Coach",
    bio: "Former Australian U21 representative and three-time NSW State Women's Champion, Sarah brings world-class experience to every junior session. Her engaging teaching style has made her one of the most sought-after development coaches in the country.",
    fallbackImage: "/images/coach-4.jpg",
  },
  {
    name: "Marcus Liu",
    title: "Fitness & Strategy Coach",
    bio: "Armed with a Bachelor of Sports Science and a former top-50 NSW ranking, Marcus bridges physical athleticism with tactical intelligence. His data-driven training programs form the backbone of the club's competitive conditioning system.",
    fallbackImage: "/images/coach-4.jpg",
  },
];

export default function AboutUsPage() {
  const [stats, setStats] = useState({ membersDisplay: "—", coachingSessions: "—", socialSessions: "—" });
  const [story, setStory] = useState(DEFAULT_STORY)
  const [coaching, setCoaching] = useState(DEFAULT_COACHING)
  const [coaches, setCoaches] = useState(DEFAULT_COACHES)
  const [imageTs, setImageTs] = useState(Date.now())

  useEffect(() => {
    homepageAPI.getStats().then((r) => setStats(r.data)).catch(() => {})
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.about_story)   setStory(s => ({ ...s, ...c.about_story }))
      if (c.about_coaching) setCoaching(s => ({ ...s, ...c.about_coaching }))
      if (c.about_coaches?.coaches) setCoaches(c.about_coaches.coaches.map((coach, i) => ({ ...DEFAULT_COACHES[i], ...coach })))
      setImageTs(Date.now())
    }).catch(() => {})
  }, []);

  return (
    <div className="bg-white">
      {/* ── Intro header ─────────────────────────────────────────────────── */}
      <section className="pt-28 pb-14 px-6 text-center border-b border-gray-100">
        <h1 className="font-display text-2xl md:text-3xl font-normal text-black mb-4 leading-snug">
          Epping Table Tennis Club
        </h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed mb-6">
          Sydney's premier table tennis club — built by players, for players,
          since 2015.
        </p>
        <Link
          to="/register"
          className="text-sm text-black border-b border-black pb-0.5 hover:text-gray-500 hover:border-gray-500 transition-colors"
        >
          Join the Club
        </Link>
      </section>

      {/* ── Full-width photo ─────────────────────────────────────────────── */}
      <BannerSlideshow className="w-full h-screen" />

      {/* ── Story — text left, image right ───────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
        <div className="flex flex-col justify-center px-12 lg:px-20 py-16">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4">
            Who We Are
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-normal text-black mb-6 leading-tight">
            {story.headline}
          </h2>
          <p className="text-gray-600 leading-relaxed mb-4">{story.body1}</p>
          <p className="text-gray-600 leading-relaxed mb-8">{story.body2}</p>
          <div className="grid grid-cols-3 gap-6 border-t border-gray-100 pt-8">
            {[
              { value: stats.membersDisplay, label: "Members" },
              { value: stats.coachingSessions, label: "Coaching Sessions" },
              { value: stats.socialSessions, label: "Social Sessions" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="font-display text-3xl font-normal text-black">
                  {value}
                </p>
                <p className="text-gray-400 text-xs tracking-widest uppercase mt-1">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden h-[560px] lg:h-auto">
          <img
            src={`${pagesAPI.getImageUrl('about_story')}?t=${imageTs}`}
            alt="Club"
            className="w-full h-full object-cover"
            onError={e => { e.target.src = '/images/banner2.jpg' }}
          />
        </div>
      </section>

      {/* ── Coaching — image left, text right ────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
        <div className="overflow-hidden h-[560px] lg:h-auto order-2 lg:order-1">
          <img
            src={`${pagesAPI.getImageUrl('about_coaching')}?t=${imageTs}`}
            alt="Coaching"
            className="w-full h-full object-cover"
            onError={e => { e.target.src = '/images/training/group.png' }}
          />
        </div>
        <div className="flex flex-col justify-center px-12 lg:px-20 py-16 order-1 lg:order-2">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4">
            Expert Guidance
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-normal text-black mb-6 leading-tight">
            {coaching.headline}
          </h2>
          <p className="text-gray-600 leading-relaxed mb-4">{coaching.body1}</p>
          <p className="text-gray-600 leading-relaxed mb-8">{coaching.body2}</p>
          <Link
            to="/training"
            className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200 self-start"
          >
            Explore Programs
          </Link>
        </div>
      </section>

      {/* ── Coaches ──────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100">
        <div className="text-center py-14">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4">
            The Team
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-normal text-black leading-tight">
            Meet Our Coaches
          </h2>
        </div>

        {coaches.map((coach, idx) => (
          <div
            key={coach.name}
            className="flex flex-col md:flex-row border-t border-gray-100"
          >
            {/* Image */}
            <div
              className={`w-full md:w-1/2 self-start ${idx % 2 === 1 ? "md:order-2" : ""}`}
            >
              <img
                src={`${pagesAPI.getImageUrl(`about_coach_${idx}`)}?t=${imageTs}`}
                alt={coach.name}
                className="w-full"
                onError={e => { e.target.src = coach.fallbackImage || '/images/coach-4.jpg' }}
              />
            </div>
            {/* Content */}
            <div
              className={`w-full md:w-1/2 flex flex-col justify-center items-center text-center px-12 py-16 ${idx % 2 === 1 ? "md:order-1" : ""}`}
            >
              <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3">
                {coach.title}
              </p>
              <h3 className="font-display text-3xl md:text-4xl font-normal text-black mb-5">
                {coach.name}
              </h3>
              <p className="text-gray-500 leading-relaxed text-sm max-w-xs">
                {coach.bio}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 text-center border-t border-gray-100">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-6">
          Join Us
        </p>
        <h2 className="font-display text-5xl md:text-6xl font-light tracking-wide text-black mb-6">
          Ready to Play?
        </h2>
        <p className="text-gray-600 mb-10 max-w-md mx-auto leading-relaxed">
          Become part of Epping Table Tennis Club — Sydney's most welcoming
          competitive table tennis community.
        </p>
        <Link
          to="/register"
          className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
        >
          Get Started
        </Link>
      </section>
    </div>
  );
}
