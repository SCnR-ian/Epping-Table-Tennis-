import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useClub } from "@/context/ClubContext";
import { useEditMode } from "@/context/EditModeContext";
import { pagesAPI } from "@/api/api";
import EditableText from "@/components/cms/EditableText";

// ── Icons ──────────────────────────────────────────────────────────────────
const IconPhone = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
)
const IconEmail = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
)
const IconWeChat = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.015.806-.035-.751-2.578.257-5.39 2.65-7.182C10.9 8.01 9.895 7.659 8.69 7.659c-.386 0-.77.031-1.144.09a.527.527 0 01-.09.008.55.55 0 01-.547-.55.55.55 0 01.547-.549c.42 0 .841.034 1.247.099 2.042-2.17 5.077-3.57 8.448-3.57h.05C15.062 2.88 11.998 2.188 8.691 2.188zm-2.48 4.53a.826.826 0 110 1.652.826.826 0 010-1.652zm4.95 0a.826.826 0 110 1.652.826.826 0 010-1.652zM24 14.465c0-3.399-3.188-6.155-7.124-6.155-3.936 0-7.125 2.756-7.125 6.155 0 3.4 3.189 6.155 7.125 6.155.836 0 1.64-.12 2.385-.337a.696.696 0 01.572.078l1.522.89a.261.261 0 00.134.043.236.236 0 00.232-.236c0-.058-.023-.113-.038-.17l-.312-1.184a.472.472 0 01.17-.532C23.073 18.092 24 16.368 24 14.465zm-9.305-.34a.66.66 0 110-1.32.66.66 0 010 1.32zm4.36 0a.66.66 0 110-1.32.66.66 0 010 1.32z"/>
  </svg>
)
const IconWhatsApp = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)
const IconFacebook = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)
const IconInstagram = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
)

// ── Link columns (static) ──────────────────────────────────────────────────
const LINK_COLUMNS = [
  {
    heading: "Club",
    items: [
      { label: "Home",     to: "/" },
      { label: "About Us", to: "/about" },
      { label: "Training", to: "/training" },
      { label: "Play",     to: "/play" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Login",     to: "/login" },
      { label: "Register",  to: "/register" },
      { label: "Dashboard", to: "/dashboard" },
    ],
  },
  {
    heading: "Info",
    items: [
      { label: "Schedule", to: "/" },
      { label: "Contact",  to: "/" },
    ],
  },
]

const DEFAULT_CONTACT = {
  phone:     "(02) 9876 5432",
  email:     "info@eppingttclub.com.au",
  wechat:    "",
  whatsapp:  "",
  facebook:  "",
  instagram: "",
}

// ── ContactRow — icon + editable value ────────────────────────────────────
function ContactRow({ icon, value, href, placeholder, onSave }) {
  const { isEditing } = useEditMode()

  if (!isEditing && !value) return null

  return (
    <li className="flex items-center gap-2.5 justify-center">
      <span className="text-gray-500 flex-shrink-0">{icon}</span>
      {isEditing ? (
        <EditableText
          as="span"
          value={value}
          onSave={onSave}
          placeholder={placeholder}
          className="text-sm text-gray-700 font-light"
        />
      ) : href ? (
        <a href={href} className="text-sm text-gray-700 hover:text-black transition-colors font-light">
          {value}
        </a>
      ) : (
        <span className="text-sm text-gray-700 font-light">{value}</span>
      )}
    </li>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────
export default function Footer() {
  const { club } = useClub() ?? {}
  const { isEditing } = useEditMode()

  const [brandName, setBrandName] = useState(null) // null until loaded from API
  const [contact, setContact] = useState(DEFAULT_CONTACT)

  useEffect(() => {
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.home_hero?.headline)  setBrandName(c.home_hero.headline)
      if (c.home_contact) setContact(ct => ({ ...DEFAULT_CONTACT, ...ct, ...c.home_contact }))
    }).catch(() => {})
  }, [])

  // Fall back to ClubContext values when pagesAPI data is absent
  useEffect(() => {
    if (!club) return
    setBrandName(n => n === null ? (club.name ?? 'Epping Table Tennis Club') : n)
    setContact(ct => ({
      ...ct,
      phone: ct.phone || club.settings?.contactPhone || DEFAULT_CONTACT.phone,
      email: ct.email || club.settings?.contactEmail || DEFAULT_CONTACT.email,
    }))
  }, [club])

  const saveContact = (field, value) => {
    const updated = { ...contact, [field]: value }
    setContact(updated)
    pagesAPI.updateContent('home_contact', updated).catch(() => {})
  }

  const saveBrandName = (v) => {
    if (brandName === null) return // not yet loaded — don't overwrite with stale default
    setBrandName(v)
    pagesAPI.getContent().then(r => {
      const existing = r.data.content.home_hero ?? {}
      pagesAPI.updateContent('home_hero', { ...existing, headline: v }).catch(() => {})
    }).catch(() => {})
  }

  const clubName = brandName || club?.name || 'Epping Table Tennis Club'

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-8">

        {/* Main columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-12 border-b border-gray-100">

          {/* Contact column */}
          <div className="text-center">
            <h4 className="text-[11px] tracking-[0.15em] uppercase text-black font-normal mb-5">Contact</h4>
            <ul className="space-y-3">
              <ContactRow
                icon={<IconPhone />}
                value={contact.phone}
                href={contact.phone ? `tel:${contact.phone.replace(/\D/g, '')}` : null}
                placeholder="Add phone"
                onSave={v => saveContact('phone', v)}
              />
              <ContactRow
                icon={<IconEmail />}
                value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : null}
                placeholder="Add email"
                onSave={v => saveContact('email', v)}
              />
              <ContactRow
                icon={<IconWeChat />}
                value={contact.wechat}
                href={null}
                placeholder="Add WeChat ID"
                onSave={v => saveContact('wechat', v)}
              />
              <ContactRow
                icon={<IconWhatsApp />}
                value={contact.whatsapp}
                href={contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}` : null}
                placeholder="Add WhatsApp number"
                onSave={v => saveContact('whatsapp', v)}
              />
              <ContactRow
                icon={<IconFacebook />}
                value={contact.facebook}
                href={contact.facebook ? `https://facebook.com/${contact.facebook}` : null}
                placeholder="Add Facebook page"
                onSave={v => saveContact('facebook', v)}
              />
              <ContactRow
                icon={<IconInstagram />}
                value={contact.instagram}
                href={contact.instagram ? `https://instagram.com/${contact.instagram}` : null}
                placeholder="Add Instagram handle"
                onSave={v => saveContact('instagram', v)}
              />
            </ul>
          </div>

          {/* Link columns */}
          {LINK_COLUMNS.map(({ heading, items }) => (
            <div key={heading} className="text-center">
              <h4 className="text-[11px] tracking-[0.15em] uppercase text-black font-normal mb-5">
                {heading}
              </h4>
              <ul className="space-y-3">
                {items.map(({ label, to }) => (
                  <li key={label}>
                    <Link to={to} className="text-sm text-gray-700 hover:text-black transition-colors font-light">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-500 tracking-wider">
            © {new Date().getFullYear()} {clubName}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs text-gray-500 hover:text-black transition-colors">Privacy Policy</Link>
            <Link to="/" className="text-xs text-gray-500 hover:text-black transition-colors">Terms of Use</Link>
          </div>
        </div>

        {/* Brand name stamp */}
        <div className="mt-10 text-center">
          <EditableText
            as="p"
            value={clubName}
            onSave={saveBrandName}
            className="font-display text-2xl tracking-[0.3em] uppercase text-black"
          />
        </div>

      </div>
    </footer>
  )
}
