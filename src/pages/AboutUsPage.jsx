import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { homepageAPI, pagesAPI, coachingAPI } from "@/api/api";
import { useEditMode } from "@/context/EditModeContext";
import { useClub } from "@/context/ClubContext";
import EditableText from "@/components/cms/EditableText";

const imgSrc = (id, ts) => { const b = pagesAPI.getImageUrl(id); return `${b}${b.includes('?') ? '&' : '?'}t=${ts ?? 0}` }

// ── Banner components (same pattern as HomePage) ──────────────────────────

const FALLBACK_BANNER_IMAGES = [
  "/images/ETTC1.jpg", "/images/ETTC2.jpg", "/images/ETTC3.jpg",
  "/images/ETTC4.jpg", "/images/ETTC5.jpg", "/images/ETTC6.jpg",
]

function BannerSlideshow({ className = "", slots }) {
  const srcs = (() => {
    const filled = (slots ?? []).filter(Boolean).map(s => s.url)
    return filled
  })()
  const [current, setCurrent] = useState(0)
  useEffect(() => { setCurrent(0) }, [srcs.length])
  useEffect(() => {
    const t = setInterval(() => setCurrent(i => (i + 1) % srcs.length), 4000)
    return () => clearInterval(t)
  }, [srcs.length])
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {srcs.map((src, i) => (
        <img key={src} src={src} alt="Epping Table Tennis"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === current ? 1 : 0 }} />
      ))}
    </div>
  )
}

function BannerSlotModal({ title, slots, onUploadSlot, onDeleteSlot, onClose }) {
  const inputRefs = useRef([])
  const [busy, setBusy] = useState(null)

  const handleFile = async (i, e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setBusy(i)
    await onUploadSlot(i, file)
    setBusy(null)
  }

  const handleDelete = async (e, i) => {
    e.stopPropagation()
    setBusy(i)
    await onDeleteSlot(i)
    setBusy(null)
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[520px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-0.5"><X size={18} /></button>
        </div>
        <p className="text-gray-500 text-sm mb-5">Up to 6 images. Click a slot to upload or replace.</p>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => {
            const slot = slots[i]
            return (
              <div key={i} className="relative group/slot">
                <button
                  onClick={() => inputRefs.current[i]?.click()}
                  className={`w-full aspect-[4/3] rounded-xl overflow-hidden border-2 flex flex-col items-center justify-center transition-opacity hover:opacity-80
                    ${slot ? 'border-transparent' : 'border-dashed border-gray-300 bg-gray-50'}`}
                >
                  {slot
                    ? <img src={slot.url} alt={`Slot ${i + 1}`} className="w-full h-full object-cover" />
                    : <><Upload size={22} className="text-gray-300 mb-1.5" /><span className="text-gray-400 text-xs">Slot {i + 1}</span></>
                  }
                  {busy === i && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                      <Loader2 size={20} className="text-white animate-spin" />
                    </div>
                  )}
                </button>
                {slot && <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded pointer-events-none">{i + 1}</span>}
                {slot && busy !== i && (
                  <button onClick={e => handleDelete(e, i)}
                    className="absolute top-1.5 right-1.5 z-10 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/slot:opacity-100 transition-opacity"
                    title="Delete image"><X size={12} /></button>
                )}
                <input ref={el => { inputRefs.current[i] = el }} type="file" accept="image/*" className="hidden" onChange={e => handleFile(i, e)} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EditableBanner({ className, title, slots, onUploadSlot, onDeleteSlot, children }) {
  const { isEditing } = useEditMode()
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <div className={`relative group ${className}`}>
      {children}
      {isEditing && (
        <>
          <button onClick={() => setModalOpen(true)}
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
            <Camera size={13} /> Replace Image
          </button>
          {modalOpen && <BannerSlotModal title={title} slots={slots} onUploadSlot={onUploadSlot} onDeleteSlot={onDeleteSlot} onClose={() => setModalOpen(false)} />}
        </>
      )}
    </div>
  )
}

// ── Inline-replaceable single image ───────────────────────────────────────
function EditableImage({ src, alt, className, onUpload, fallback }) {
  const { isEditing } = useEditMode()
  const inputRef = useRef()
  return (
    <div className="relative group w-full h-full">
      <img src={src} alt={alt} className={className} onError={e => { if (fallback) e.target.src = fallback }} />
      {isEditing && (
        <>
          <button onClick={() => inputRef.current?.click()}
            className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
            <Camera size={13} /> Replace Image
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = '' } }} />
        </>
      )}
    </div>
  )
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_INTRO = {
  headline: '',
  subtext: '',
}
const DEFAULT_STORY = {
  label: 'Who We Are',
  headline: '',
  body1: '',
  body2: '',
}
const DEFAULT_COACHING = {
  label: 'Expert Guidance',
  headline: '',
  body1: '',
  body2: '',
}
const DEFAULT_COACHES = [
  { name: '', title: '', bio: '', fallbackImage: '/images/coach-4.jpg' },
  { name: '', title: '', bio: '', fallbackImage: '/images/coach-4.jpg' },
  { name: '', title: '', bio: '', fallbackImage: '/images/coach-4.jpg' },
]
const DEFAULT_CTA = {
  headline: 'Ready to Play?',
  body: '',
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AboutUsPage() {
  const { isEditing } = useEditMode()
  const { club } = useClub() ?? {}
  const [stats, setStats] = useState({ membersDisplay: "—", coachingSessions: "—", socialSessions: "—" })
  const [intro, setIntro] = useState(DEFAULT_INTRO)
  const [story, setStory] = useState(DEFAULT_STORY)
  const [coaching, setCoaching] = useState(DEFAULT_COACHING)
  const [coaches, setCoaches] = useState(DEFAULT_COACHES)
  const [coachRatings, setCoachRatings] = useState([])
  const [cta, setCta] = useState(DEFAULT_CTA)
  const [bannerSlots, setBannerSlots] = useState(Array(6).fill(null))
  const [imgTs, setImgTs] = useState({}) // per-key timestamps for cache-busting

  const loadBannerSlots = () => {
    pagesAPI.getImageIds('about_banner_').then(r => {
      const slots = Array(6).fill(null)
      ;(r.data.ids ?? []).forEach(id => {
        const i = parseInt(id.slice('about_banner_'.length), 10)
        if (!isNaN(i) && i < 6) { const base = pagesAPI.getImageUrl(id); const sep = base.includes('?') ? '&' : '?'; slots[i] = { id, url: `${base}${sep}t=${Date.now()}` } }
      })
      setBannerSlots(slots)
    }).catch(() => {})
  }

  useEffect(() => {
    if (!club) return
    setIntro(s => ({ ...s, headline: s.headline || club.name }))
  }, [club])

  useEffect(() => {
    homepageAPI.getStats().then(r => setStats(r.data)).catch(() => {})
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.about_intro)   setIntro(s => ({ ...s, ...c.about_intro }))
      if (c.about_story)   setStory(s => ({ ...s, ...c.about_story }))
      if (c.about_coaching) setCoaching(s => ({ ...s, ...c.about_coaching }))
      if (c.about_coaches?.coaches) setCoaches(c.about_coaches.coaches.map((coach, i) => ({ ...DEFAULT_COACHES[i], ...coach })))
      if (c.about_cta)     setCta(s => ({ ...s, ...c.about_cta }))
      setImgTs({ about_story: Date.now(), about_coaching: Date.now(), ...Object.fromEntries(DEFAULT_COACHES.map((_, i) => [`about_coach_${i}`, Date.now()])) })
    }).catch(() => {})
    coachingAPI.getPublicCoaches().then(r => setCoachRatings(r.data.coaches ?? [])).catch(() => {})
    loadBannerSlots()
  }, [])

  // ── Save helpers ──────────────────────────────────────────────────────────

  const saveIntro    = (u) => { const n = { ...intro, ...u };    setIntro(n);    pagesAPI.updateContent('about_intro', n).catch(() => {}) }
  const saveStory    = (u) => { const n = { ...story, ...u };    setStory(n);    pagesAPI.updateContent('about_story', n).catch(() => {}) }
  const saveCoaching = (u) => { const n = { ...coaching, ...u }; setCoaching(n); pagesAPI.updateContent('about_coaching', n).catch(() => {}) }
  const saveCta      = (u) => { const n = { ...cta, ...u };      setCta(n);      pagesAPI.updateContent('about_cta', n).catch(() => {}) }

  const saveCoach = (idx, field, value) => {
    const updated = coaches.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    setCoaches(updated)
    pagesAPI.updateContent('about_coaches', { coaches: updated }).catch(() => {})
  }

  const replaceImage = async (key, file) => {
    const fd = new FormData()
    fd.append('image', file)
    await pagesAPI.uploadImage(key, fd).catch(() => {})
    setImgTs(prev => ({ ...prev, [key]: Date.now() }))
  }

  const uploadOneSlot = async (slotKey, file) => {
    const fd = new FormData()
    fd.append('image', file)
    await pagesAPI.uploadImage(slotKey, fd).catch(() => {})
  }

  return (
    <div className="bg-white">

      {/* ── Intro header ──────────────────────────────────────────────────── */}
      <section className="pt-28 pb-14 px-6 text-center border-b border-gray-100">
        <EditableText
          as="h1"
          value={intro.headline}
          onSave={v => saveIntro({ headline: v })}
          placeholder="Your club name"
          className="font-display text-2xl md:text-3xl font-normal text-black mb-4 leading-snug"
        />
        <EditableText
          as="p"
          value={intro.subtext}
          onSave={v => saveIntro({ subtext: v })}
          multiline
          placeholder="A short tagline about your club"
          className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed mb-6"
        />
        <Link to="/register" className="text-sm text-black border-b border-black pb-0.5 hover:text-gray-500 hover:border-gray-500 transition-colors">
          Join the Club
        </Link>
      </section>

      {/* ── Full-width banner ─────────────────────────────────────────────── */}
      <EditableBanner
        className="w-full h-screen"
        title="About Us — Banner"
        slots={bannerSlots}
        onUploadSlot={async (i, file) => {
          await uploadOneSlot(`about_banner_${i}`, file)
          loadBannerSlots()
        }}
        onDeleteSlot={async (i) => {
          await pagesAPI.deleteImage(bannerSlots[i].id).catch(() => {})
          loadBannerSlots()
        }}
      >
        <BannerSlideshow className="w-full h-full" slots={bannerSlots} />
      </EditableBanner>

      {/* ── Story — text left, image right ───────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
        <div className="flex flex-col justify-center px-12 lg:px-20 py-16">
          <EditableText
            as="p"
            value={story.label}
            onSave={v => saveStory({ label: v })}
            className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4"
          />
          <EditableText
            as="h2"
            value={story.headline}
            onSave={v => saveStory({ headline: v })}
            placeholder="Your story headline"
            className="font-display text-4xl md:text-5xl font-normal text-black mb-6 leading-tight"
          />
          <EditableText
            as="p"
            value={story.body1}
            onSave={v => saveStory({ body1: v })}
            multiline
            placeholder="Tell your club's story..."
            className="text-gray-600 leading-relaxed mb-4"
          />
          <EditableText
            as="p"
            value={story.body2}
            onSave={v => saveStory({ body2: v })}
            multiline
            placeholder="Continue your story here..."
            className="text-gray-600 leading-relaxed mb-8"
          />
          <div className="grid grid-cols-3 gap-6 border-t border-gray-100 pt-8">
            {[
              { value: stats.membersDisplay, label: "Members" },
              { value: stats.coachingSessions, label: "Coaching Sessions" },
              { value: stats.socialSessions, label: "Social Sessions" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="font-display text-3xl font-normal text-black">{value}</p>
                <p className="text-gray-400 text-xs tracking-widest uppercase mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden h-[560px] lg:h-auto">
          <EditableImage
            src={imgSrc('about_story', imgTs.about_story)}
            alt="Club"
            className="w-full h-full object-cover"
            fallback="/images/banner2.jpg"
            onUpload={file => replaceImage('about_story', file)}
          />
        </div>
      </section>

      {/* ── Coaching — image left, text right ────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
        <div className="overflow-hidden h-[560px] lg:h-auto order-2 lg:order-1">
          <EditableImage
            src={imgSrc('about_coaching', imgTs.about_coaching)}
            alt="Coaching"
            className="w-full h-full object-cover"
            fallback="/images/training/group.png"
            onUpload={file => replaceImage('about_coaching', file)}
          />
        </div>
        <div className="flex flex-col justify-center px-12 lg:px-20 py-16 order-1 lg:order-2">
          <EditableText
            as="p"
            value={coaching.label}
            onSave={v => saveCoaching({ label: v })}
            className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4"
          />
          <EditableText
            as="h2"
            value={coaching.headline}
            onSave={v => saveCoaching({ headline: v })}
            className="font-display text-4xl md:text-5xl font-normal text-black mb-6 leading-tight"
          />
          <EditableText
            as="p"
            value={coaching.body1}
            onSave={v => saveCoaching({ body1: v })}
            multiline
            className="text-gray-600 leading-relaxed mb-4"
          />
          <EditableText
            as="p"
            value={coaching.body2}
            onSave={v => saveCoaching({ body2: v })}
            multiline
            className="text-gray-600 leading-relaxed mb-8"
          />
          <Link to="/training" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200 self-start">
            Explore Programs
          </Link>
        </div>
      </section>

      {/* ── Coaches ──────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100 py-24 px-6">
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4">The Team</p>
          <h2 className="font-display text-4xl md:text-5xl font-normal text-black leading-tight">Meet Our Coaches</h2>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10">
          {coaches.map((coach, idx) => (
            <div key={idx} className="flex flex-col">
              {/* Portrait photo */}
              <div className="aspect-[3/4] overflow-hidden mb-6">
                <EditableImage
                  src={imgSrc(`about_coach_${idx}`, imgTs[`about_coach_${idx}`])}
                  alt={coach.name}
                  className="w-full h-full object-cover object-top transition-transform duration-500 hover:scale-105"
                  fallback={coach.fallbackImage || '/images/coach-4.jpg'}
                  onUpload={file => replaceImage(`about_coach_${idx}`, file)}
                />
              </div>

              {/* Info */}
              <EditableText
                as="p"
                value={coach.title}
                onSave={v => saveCoach(idx, 'title', v)}
                className="text-[10px] tracking-[0.3em] uppercase text-gray-400 mb-2"
              />
              <EditableText
                as="h3"
                value={coach.name}
                onSave={v => saveCoach(idx, 'name', v)}
                className="font-display text-2xl font-normal text-black mb-3"
              />
              <div className="w-6 h-px bg-gray-300 mb-3" />
              <EditableText
                as="p"
                value={coach.bio}
                onSave={v => saveCoach(idx, 'bio', v)}
                multiline
                className="text-gray-500 leading-relaxed text-sm"
              />
              {(() => {
                const r = coachRatings.find(c => c.name.toLowerCase() === coach.name?.toLowerCase())
                if (!r || r.rating_count === 0) return null
                const avg = parseFloat(r.avg_rating)
                return (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <svg key={n} className={`w-4 h-4 ${n <= Math.round(avg) ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">{avg.toFixed(1)} · {r.rating_count} rating{r.rating_count !== 1 ? 's' : ''}</span>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 text-center border-t border-gray-100">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-6">Join Us</p>
        <EditableText
          as="h2"
          value={cta.headline}
          onSave={v => saveCta({ headline: v })}
          className="font-display text-5xl md:text-6xl font-light tracking-wide text-black mb-6"
        />
        <EditableText
          as="p"
          value={cta.body}
          onSave={v => saveCta({ body: v })}
          multiline
          className="text-gray-600 mb-10 max-w-md mx-auto leading-relaxed"
        />
        <Link to="/register" className="inline-block border border-black rounded-full px-10 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200">
          Get Started
        </Link>
      </section>

    </div>
  )
}
