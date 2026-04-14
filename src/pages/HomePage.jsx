import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useClub } from "@/context/ClubContext";
import { homepageAPI, pagesAPI } from "@/api/api";

const FALLBACK_BANNER_IMAGES = [
  "/images/ETTC1.jpg",
  "/images/ETTC2.jpg",
  "/images/ETTC3.jpg",
  "/images/ETTC4.jpg",
  "/images/ETTC5.jpg",
  "/images/ETTC6.jpg",
]

function BannerSlideshow({ className = "", images }) {
  const srcs = images?.length ? images : FALLBACK_BANNER_IMAGES
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    setCurrent(0)
  }, [srcs.length])
  useEffect(() => {
    const t = setInterval(() => setCurrent(i => (i + 1) % srcs.length), 4000)
    return () => clearInterval(t)
  }, [srcs.length])
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {srcs.map((src, i) => (
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

const DEFAULT_HERO = {
  headline:    'Epping Table Tennis',
  subheadline: "Sydney's Premier Table Tennis Club",
}
const DEFAULT_CONTACT = {
  phone:    '(02) 9876 5432',
  email:    'info@eppingttclub.com.au',
  address:  '33 Oxford St\nEpping NSW 2121\nAustralia',
  wechat:   '',
  gettingHere: '2 min walk from Epping Station\nBus stop directly outside\nFree parking on-site',
  schedule: [
    { day: 'Mon', time: '4:00 – 8:30 PM' },
    { day: 'Tue', time: '4:00 – 8:30 PM' },
    { day: 'Wed', time: '4:00 – 8:30 PM' },
    { day: 'Sat', time: '1:00 – 6:30 PM' },
  ],
}

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

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { club } = useClub() ?? {}
  const [stats, setStats] = useState({ membersDisplay: '—', coachingSessions: '—', socialSessions: '—' });
  const [cards, setCards] = useState(DEFAULT_CARDS);
  const [hero, setHero] = useState(DEFAULT_HERO)
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  const [bannerImages,  setBannerImages]  = useState([])
  const [bannerImages2, setBannerImages2] = useState([])
  const [bannerImages3, setBannerImages3] = useState([])

  // Seed defaults from ClubContext once it loads
  useEffect(() => {
    if (!club) return
    setHero(h => ({ headline: club.name, subheadline: h.subheadline }))
    setContact(ct => ({
      ...ct,
      phone:   club.settings?.contactPhone || ct.phone,
      email:   club.settings?.contactEmail || ct.email,
      address: club.settings?.address      || ct.address,
      wechat:  club.settings?.wechat       ?? ct.wechat,
    }))
  }, [club])

  useEffect(() => {
    homepageAPI.getStats().then(r => setStats(r.data)).catch(() => {})
    homepageAPI.getCards().then(r => setCards(r.data.cards)).catch(() => {})
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.home_hero)    setHero(h => ({ ...h, ...c.home_hero }))
      if (c.home_contact) setContact(ct => ({ ...ct, ...c.home_contact }))
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner').then(r => {
      if (r.data.ids?.length) {
        const sorted = [...r.data.ids].sort()
        setBannerImages(sorted.map(id => pagesAPI.getImageUrl(id)))
      }
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner2').then(r => {
      if (r.data.ids?.length) {
        const sorted = [...r.data.ids].sort()
        setBannerImages2(sorted.map(id => pagesAPI.getImageUrl(id)))
      }
    }).catch(() => {})
    pagesAPI.getImageIds('home_banner3').then(r => {
      if (r.data.ids?.length) {
        const sorted = [...r.data.ids].sort()
        setBannerImages3(sorted.map(id => pagesAPI.getImageUrl(id)))
      }
    }).catch(() => {})
  }, []);

  const schedule = contact.schedule ?? DEFAULT_CONTACT.schedule

  return (
    <div className="bg-white">
      {/* ── Hero ── */}
      <section className="relative h-screen -mt-[84px] overflow-hidden">
        <BannerSlideshow className="absolute inset-0 w-full h-full" images={bannerImages} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/20" />
        <div className="absolute bottom-14 left-0 right-0 text-center px-4">
          <p className="text-white/60 text-[10px] tracking-[0.4em] uppercase mb-5 font-light">
            {hero.subheadline}
          </p>
          <h1 className="font-display text-white text-5xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-7 leading-none">
            {hero.headline}
          </h1>
          <div className="flex items-center justify-center gap-8">
            {isAuthenticated ? (
              <Link to="/play" className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors">
                Join Social Play
              </Link>
            ) : (
              <>
                <Link to="/register" className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors">
                  Join the Club
                </Link>
                <span className="text-white/20">|</span>
                <Link to="/play" className="text-white/90 text-[11px] tracking-[0.25em] uppercase border-b border-white/50 hover:border-white hover:text-white pb-0.5 transition-colors">
                  Social Play
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Intro ── */}
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
                <p className="font-display text-4xl font-bold text-black">{value}</p>
                <p className="text-gray-400 text-xs tracking-widest uppercase mt-1">{label}</p>
              </div>
            ))}
          </div>
          <Link to="/about" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200">
            Discover More
          </Link>
        </div>
      </section>

      {/* ── Full-width photo ── */}
      <BannerSlideshow className="w-full h-screen" images={bannerImages2} />

      {/* ── Programs ── */}
      <section className="py-14 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-black text-center mb-10 leading-snug">
            Explore Our Training Programs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {cards.map((card) => (
              <div key={card.id} className="flex flex-col">
                <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden mb-4">
                  <img
                    src={card.hasImage ? homepageAPI.getImageUrl(card.id) : CARD_FALLBACKS[card.id]}
                    alt={card.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <Link to={`/training#${card.id}`} className="text-sm font-medium text-black hover:text-gray-500 transition-colors text-center leading-snug">
                  {card.title}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full-width photo 2 ── */}
      <BannerSlideshow className="w-full h-screen" images={bannerImages3} />

      {/* ── Schedule ── */}
      <section className="py-12 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3">Opening Hours</p>
          <h2 className="font-display text-4xl font-bold text-black mb-8">Weekly Schedule</h2>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {schedule.map(({ day, time }) => (
              <div key={day} className="flex items-center justify-between py-5">
                <span className="font-display text-2xl font-bold text-black">{day}</span>
                <span className="text-gray-700 text-sm tracking-wider">Open Practice</span>
                <span className="text-gray-700 text-sm">{time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location ── */}
      <section className="border-t border-gray-100 py-12 px-6 lg:px-10 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3">Location</p>
            <h2 className="font-display text-4xl font-bold text-black">Find Us</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">Getting Here</p>
              <div className="text-gray-800 text-sm space-y-1">
                {(contact.gettingHere || DEFAULT_CONTACT.gettingHere).split('\n').map((l, i) => <p key={i}>{l}</p>)}
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">Address</p>
              <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">{contact.address}</p>
            </div>
            <div className="text-center">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-600 font-semibold mb-3">Contact</p>
              <p className="text-gray-800 text-sm">{contact.phone}</p>
              <p className="text-gray-800 text-sm mt-1">{contact.email}</p>
              {contact.wechat && <p className="text-gray-800 text-sm mt-1">WeChat: {contact.wechat}</p>}
            </div>
          </div>
          <div className="overflow-hidden h-[420px]">
            <iframe
              title="Club location"
              src="https://maps.google.com/maps?q=Epping+NSW+2121+Australia&output=embed"
              width="100%" height="100%"
              style={{ border: 0 }}
              allowFullScreen loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-12 px-6 lg:px-10 text-center border-t border-gray-100">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-500 mb-6">Join Us</p>
        <h2 className="font-display text-5xl md:text-6xl font-light tracking-wide text-black mb-6">Ready to Play?</h2>
        <p className="text-gray-700 mb-10 font-light max-w-md mx-auto leading-relaxed">
          Join hundreds of members who train, compete, and improve every week at Epping Table Tennis Club.
        </p>
        {isAuthenticated ? (
          <Link to="/play" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200">
            Join Social Play
          </Link>
        ) : (
          <div className="flex items-center justify-center gap-6">
            <Link to="/register" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200">
              Join the Club
            </Link>
            <Link to="/login" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200">
              Sign In
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
