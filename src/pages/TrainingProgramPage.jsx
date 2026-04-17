import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Camera, Trash2, Plus } from "lucide-react";
import { homepageAPI, pagesAPI } from "@/api/api";
import { useEditMode } from "@/context/EditModeContext";
import EditableText from "@/components/cms/EditableText";

// ── Inline-replaceable image ───────────────────────────────────────────────
function EditableImage({ src, alt, className, onUpload, fallback }) {
  const { isEditing } = useEditMode()
  const inputRef = useRef()
  return (
    <div className="relative group w-full h-full">
      <img
        src={src} alt={alt} className={className}
        onError={e => { if (fallback) e.target.src = fallback }}
      />
      {isEditing && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
          >
            <Camera size={13} /> Replace Image
          </button>
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = '' } }}
          />
        </>
      )}
    </div>
  )
}

// ── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_INTRO = {
  headline:    'Training Programs',
  subheadline: 'From beginner to competitive — we have a program designed for every stage of your journey.',
}

const DEFAULT_PROGRAMS = [
  {
    id: "private",
    label: "One-on-One",
    tagline: "Personalised sessions tailored entirely to your game",
    description: "Your coach will identify weaknesses, refine technique, and design a development plan that gets you to your goals faster than group training. Suitable for all skill levels, from complete beginners to competitive players.",
    features: [
      "1-on-1 attention from a certified coach",
      "Customised training plan & drills",
      "Video analysis on request",
      "Flexible scheduling — book online anytime",
    ],
    image: "/images/training/private.png",
    cta: { label: "Book a Session", to: "/play" },
  },
  {
    id: "group",
    label: "Group Session",
    tagline: "Learn together, improve together",
    description: "Small-group sessions of 2–6 players led by our coaches. A great way to build skills in a social setting, benefit from shared drills, and enjoy healthy competition with peers at a similar level.",
    features: [
      "Groups of 2–6 players per coach",
      "Structured skill progressions",
      "Multi-ball drill stations",
      "Beginner, intermediate & advanced groups",
    ],
    image: "/images/training/group.png",
    cta: { label: "Enquire About Groups", to: "/play" },
  },
  {
    id: "school",
    label: "School Coaching",
    tagline: "Bringing table tennis to the classroom",
    description: "We partner with local schools to deliver table tennis as part of their sport and PE programs. Our coaches visit your school with portable equipment or host excursions to our facility, with all equipment provided.",
    features: [
      "Curriculum-aligned programs",
      "On-site school visits available",
      "Full equipment provided",
      "Certified coaches with Working with Children Checks",
    ],
    image: "/images/training/school.png",
    cta: { label: "Contact Us for Schools", to: "/about" },
  },
  {
    id: "holiday",
    label: "School Holiday",
    tagline: "Fun, intensive programs during school holidays",
    description: "Holiday programs for juniors aged 7–17. Full-day and half-day options available. Players learn fundamentals, compete in mini-tournaments, and make new friends in a relaxed, fun environment.",
    features: [
      "Half-day & full-day sessions",
      "Ages 7–17 welcome",
      "Mini-tournaments & friendly matches",
      "All equipment supplied",
    ],
    image: "/images/training/holiday.png",
    cta: { label: "View Holiday Dates", to: "/play" },
  },
]

const DEFAULT_CTA = {
  label:    'Get in Touch',
  headline: 'Ready to get started?',
  body:     "Contact us through any of the channels below and we'll help you find the right program.",
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function TrainingProgramPage() {
  const { isEditing } = useEditMode()
  const [intro, setIntro]       = useState(DEFAULT_INTRO)
  const [programs, setPrograms] = useState(DEFAULT_PROGRAMS)
  const [cta, setCta]           = useState(DEFAULT_CTA)
  const [contact, setContact]   = useState({})
  const [imgTs, setImgTs]       = useState({})

  useEffect(() => {
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.training_intro) setIntro(s => ({ ...s, ...c.training_intro }))
      if (c.training_cta)   setCta(s => ({ ...s, ...c.training_cta }))
      if (c.home_contact)   setContact(c.home_contact)
      DEFAULT_PROGRAMS.forEach(def => {
        const key = `training_${def.id}`
        if (c[key]) setPrograms(prev => prev.map(p => p.id === def.id ? { ...p, ...c[key] } : p))
      })
      setImgTs(Object.fromEntries(DEFAULT_PROGRAMS.map(p => [p.id, Date.now()])))
    }).catch(() => {})
  }, [])

  // ── Save helpers ──────────────────────────────────────────────────────────
  const saveIntro = (field, value) => {
    const updated = { ...intro, [field]: value }
    setIntro(updated)
    pagesAPI.updateContent('training_intro', updated).catch(() => {})
  }

  const saveCta = (field, value) => {
    const updated = { ...cta, [field]: value }
    setCta(updated)
    pagesAPI.updateContent('training_cta', updated).catch(() => {})
  }

  const saveProgram = (id, update) => {
    setPrograms(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...update } : p)
      const prog = updated.find(p => p.id === id)
      pagesAPI.updateContent(`training_${id}`, prog).catch(() => {})
      return updated
    })
  }

  const uploadProgramImage = async (id, file) => {
    const fd = new FormData()
    fd.append('image', file)
    await homepageAPI.uploadImage(id, fd).catch(() => {})
    setImgTs(prev => ({ ...prev, [id]: Date.now() }))
  }

  // ── Contact buttons (reads from home_contact) ─────────────────────────────
  const contactButtons = [
    contact.phone    && { label: 'Phone',     href: `tel:${(contact.phone||'').replace(/\D/g,'')}`,          icon: <PhoneIcon /> },
    contact.email    && { label: 'Email',     href: `mailto:${contact.email}`,                                icon: <EmailIcon /> },
    contact.whatsapp && { label: 'WhatsApp',  href: `https://wa.me/${(contact.whatsapp||'').replace(/\D/g,'')}`, icon: <WhatsAppIcon />, external: true },
    contact.wechat   && { label: `WeChat: ${contact.wechat}`, href: null,                                     icon: <WeChatIcon /> },
    contact.facebook && { label: 'Facebook',  href: `https://facebook.com/${contact.facebook}`,               icon: <FacebookIcon />, external: true },
    contact.instagram&& { label: 'Instagram', href: `https://instagram.com/${contact.instagram}`,             icon: <InstagramIcon />, external: true },
  ].filter(Boolean)

  // Fall back to defaults if home_contact not filled
  const displayButtons = contactButtons.length ? contactButtons : [
    { label: 'Phone',    href: 'tel:0298765432',                  icon: <PhoneIcon /> },
    { label: 'Email',    href: 'mailto:info@eppingttclub.com.au', icon: <EmailIcon /> },
  ]

  return (
    <div className="bg-white">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <section className="pt-28 pb-14 px-6 text-center border-b border-gray-100">
        <EditableText
          as="h1"
          value={intro.headline}
          onSave={v => saveIntro('headline', v)}
          className="font-display text-2xl md:text-3xl font-normal text-black mb-4 leading-snug"
        />
        <EditableText
          as="p"
          value={intro.subheadline}
          onSave={v => saveIntro('subheadline', v)}
          multiline
          className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed"
        />
      </section>

      {/* ── Programs ─────────────────────────────────────────────────────── */}
      {programs.map((prog, idx) => (
        <div key={prog.id} id={prog.id} className="flex flex-col md:flex-row border-b border-gray-100 scroll-mt-16">

          {/* Image */}
          <div className={`w-full md:w-1/2 overflow-hidden ${idx % 2 === 1 ? "md:order-2" : ""}`} style={{ height: '50vh' }}>
            <EditableImage
              src={`${homepageAPI.getImageUrl(prog.id)}${imgTs[prog.id] ? `?t=${imgTs[prog.id]}` : ''}`}
              alt={prog.label}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              fallback={prog.image}
              onUpload={file => uploadProgramImage(prog.id, file)}
            />
          </div>

          {/* Content */}
          <div className={`w-full md:w-1/2 flex flex-col justify-center px-12 lg:px-16 py-14 ${idx % 2 === 1 ? "md:order-1" : ""}`}>
            <EditableText
              as="p"
              value={prog.label}
              onSave={v => saveProgram(prog.id, { label: v })}
              className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-3"
            />
            <EditableText
              as="h2"
              value={prog.tagline}
              onSave={v => saveProgram(prog.id, { tagline: v })}
              className="font-display text-2xl md:text-3xl font-normal text-black mb-5 leading-snug"
            />
            <EditableText
              as="p"
              value={prog.description}
              onSave={v => saveProgram(prog.id, { description: v })}
              multiline
              className="text-gray-500 text-sm leading-relaxed mb-6"
            />

            {/* Features */}
            <ul className="space-y-2">
              {prog.features.map((f, fi) => (
                <li key={fi} className="flex items-center gap-3 text-sm text-gray-700 group/feat">
                  <span className="w-4 h-px bg-black flex-shrink-0" />
                  <EditableText
                    as="span"
                    value={f}
                    onSave={v => {
                      const updated = prog.features.map((x, i) => i === fi ? v : x)
                      saveProgram(prog.id, { features: updated })
                    }}
                    className="flex-1"
                  />
                  {isEditing && (
                    <button
                      onClick={() => {
                        const updated = prog.features.filter((_, i) => i !== fi)
                        saveProgram(prog.id, { features: updated })
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/feat:opacity-100 flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isEditing && (
              <button
                onClick={() => saveProgram(prog.id, { features: [...prog.features, 'New feature'] })}
                className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition-colors self-start"
              >
                <Plus size={13} /> Add feature
              </button>
            )}
          </div>
        </div>
      ))}

      {/* ── Contact CTA ───────────────────────────────────────────────────── */}
      <section className="py-16 px-6 text-center border-t border-gray-100">
        <EditableText
          as="p"
          value={cta.label}
          onSave={v => saveCta('label', v)}
          className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4"
        />
        <EditableText
          as="h2"
          value={cta.headline}
          onSave={v => saveCta('headline', v)}
          className="font-display text-3xl md:text-4xl font-normal text-black mb-3"
        />
        <EditableText
          as="p"
          value={cta.body}
          onSave={v => saveCta('body', v)}
          multiline
          className="text-gray-500 mb-10 max-w-md mx-auto leading-relaxed text-sm"
        />
        <div className="flex flex-wrap items-center justify-center gap-4">
          {displayButtons.map(({ label, href, icon, external }) =>
            href ? (
              <a
                key={label}
                href={href}
                {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="inline-flex items-center gap-2.5 border border-black rounded-full px-8 py-3 text-sm text-black hover:bg-black hover:text-white transition-colors duration-200"
              >
                {icon}{label}
              </a>
            ) : (
              <span key={label} className="inline-flex items-center gap-2.5 border border-black rounded-full px-8 py-3 text-sm text-black">
                {icon}{label}
              </span>
            )
          )}
        </div>
      </section>

    </div>
  )
}

// ── Small icon components ──────────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}
function EmailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}
function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}
function WeChatIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.015.806-.035-.751-2.578.257-5.39 2.65-7.182C10.9 8.01 9.895 7.659 8.69 7.659c-.386 0-.77.031-1.144.09a.527.527 0 01-.09.008.55.55 0 01-.547-.55.55.55 0 01.547-.549c.42 0 .841.034 1.247.099 2.042-2.17 5.077-3.57 8.448-3.57h.05C15.062 2.88 11.998 2.188 8.691 2.188zm-2.48 4.53a.826.826 0 110 1.652.826.826 0 010-1.652zm4.95 0a.826.826 0 110 1.652.826.826 0 010-1.652zM24 14.465c0-3.399-3.188-6.155-7.124-6.155-3.936 0-7.125 2.756-7.125 6.155 0 3.4 3.189 6.155 7.125 6.155.836 0 1.64-.12 2.385-.337a.696.696 0 01.572.078l1.522.89a.261.261 0 00.134.043.236.236 0 00.232-.236c0-.058-.023-.113-.038-.17l-.312-1.184a.472.472 0 01.17-.532C23.073 18.092 24 16.368 24 14.465zm-9.305-.34a.66.66 0 110-1.32.66.66 0 010 1.32zm4.36 0a.66.66 0 110-1.32.66.66 0 010 1.32z"/>
    </svg>
  )
}
function FacebookIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}
function InstagramIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  )
}
