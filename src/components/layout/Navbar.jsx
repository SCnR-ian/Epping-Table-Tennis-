import { useState, useEffect } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useEditMode } from "@/context/EditModeContext";
import { useCart } from "@/context/CartContext";
import { pagesAPI } from "@/api/api";
import EditableText from "@/components/cms/EditableText";
import ShoppingBag from "@/components/layout/ShoppingBag";

const DEFAULT_NAV_LINKS = [
  { to: "/",          label: "Home"     },
  { to: "/about",     label: "About Us" },
  { to: "/training",  label: "Training" },
  { to: "/play",      label: "Play"     },
  { to: "/shopping",  label: "Shopping" },
  { to: "/news",      label: "News"     },
];

// ── Club Logo (ping-pong paddle + ball) ───────────────────────────────────
function ClubLogo({ solid }) {
  const color = solid ? "#000" : "#fff"
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Club logo">
      {/* Paddle head */}
      <ellipse cx="16" cy="16" rx="12.5" ry="12.5" fill={color} />
      {/* Rubber surface accent */}
      <ellipse cx="16" cy="16" rx="8.5" ry="8.5" fill={solid ? "#fff" : "#000"} opacity="0.15" />
      {/* Handle */}
      <rect x="13.5" y="27.5" width="5" height="9" rx="2.5" fill={color} />
      {/* Ball */}
      <circle cx="32" cy="7" r="5" stroke={color} strokeWidth="2" />
      {/* Ball spin arc */}
      <path d="M28.5 5.5 Q32 3.5 35.5 5.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────
function IconPerson() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

// ── Account slide panel ────────────────────────────────────────────────────
function AccountPanel({ open, onClose }) {
  const { isAuthenticated, user, login, logout, loading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) { setShowIOSHint(h => !h); return; }
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    clearError?.();
    setLocalError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.identifier || !form.password) { setLocalError("Please fill in all fields."); return; }
    const result = await login(form);
    if (result?.success) onClose();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          <h2 className="font-display text-2xl font-normal tracking-wide text-black">My Account</h2>
          <button onClick={onClose} className="text-black hover:text-gray-400 transition-colors">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          {isAuthenticated ? (
            /* ── Logged-in state ── */
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center text-white text-lg uppercase">
                  {user?.name?.[0] ?? "U"}
                </div>
                <div>
                  <p className="font-medium text-black">{user?.name}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <Link to="/dashboard" onClick={onClose} className="block text-sm tracking-widest uppercase text-black hover:text-gray-500 py-2 transition-colors">
                  Dashboard
                </Link>
                <Link to="/profile" onClick={onClose} className="block text-sm tracking-widest uppercase text-black hover:text-gray-500 py-2 transition-colors">
                  My Profile
                </Link>
                <Link to="/play" onClick={onClose} className="block text-sm tracking-widest uppercase text-black hover:text-gray-500 py-2 transition-colors">
                  Social Play
                </Link>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <button onClick={handleLogout} className="w-full btn-outline py-3 text-xs">
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* ── Login form ── */
            <div>
              <p className="font-display text-xl font-normal text-black mb-6 tracking-wide">
                I already have an account
              </p>

              <p className="text-xs text-gray-500 mb-5">Required Fields *</p>

              {(error || localError) && (
                <p className="mb-4 text-sm text-red-500">{error || localError}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="block text-xs tracking-widest uppercase text-gray-700 mb-2">
                    E-mail <span className="text-black">*</span>
                  </label>
                  <input
                    type="text"
                    name="identifier"
                    value={form.identifier}
                    onChange={handleChange}
                    autoComplete="username"
                    className="w-full border border-gray-300 rounded-full px-5 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs tracking-widest uppercase text-gray-700 mb-2">
                    Password <span className="text-black">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                      className="w-full border border-gray-300 rounded-full px-5 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors pr-12"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                    >
                      {showPass ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <a href="#" className="block text-xs text-black underline mt-2 hover:text-gray-500">
                    Forgot your password?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black hover:bg-gray-800 text-white py-3.5 rounded-full text-sm tracking-widest uppercase transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="font-display text-xl font-normal text-black mb-3 tracking-wide">
                  I don't have an account
                </p>
                <p className="text-xs text-gray-500 mb-5">
                  Create an account to join sessions, manage your bookings, and track your coaching hours.
                </p>
                <Link to="/register" onClick={onClose} className="w-full block text-center bg-black text-white rounded-full py-3.5 text-sm tracking-widest uppercase hover:bg-gray-800 transition-colors">
                  Create an Account
                </Link>
                {!installed && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleInstall}
                      className="w-full border border-black rounded-full py-3.5 text-sm tracking-widest uppercase hover:bg-gray-50 transition-colors"
                    >
                      Install App
                    </button>
                    {showIOSHint && (
                      <p className="mt-3 text-xs text-gray-500 text-center leading-relaxed">
                        Tap the <strong>Share</strong> button ⎋ in Safari, then <strong>"Add to Home Screen"</strong>.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Menu slide panel ───────────────────────────────────────────────────────
function MenuPanel({ open, onClose, isAdmin, navLabels, navOrder, onSaveLabel, onReorder }) {
  const { isEditing } = useEditMode()
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const handleDragStart = (e, idx) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }
  const handleDrop = (e, idx) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newOrder = [...navOrder]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    onReorder(newOrder)
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}>

        {/* Close button */}
        <div className="px-7 pt-7 pb-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-black hover:text-gray-400 transition-colors group"
          >
            <IconClose />
            <span className="text-sm tracking-widest uppercase">Close</span>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-7 py-6 space-y-0">
          {navOrder.map((linkIdx, displayIdx) => {
            const { to } = DEFAULT_NAV_LINKS[linkIdx]
            const label = navLabels[linkIdx] ?? DEFAULT_NAV_LINKS[linkIdx].label
            return isEditing ? (
              <div
                key={to}
                draggable
                onDragStart={e => handleDragStart(e, displayIdx)}
                onDragOver={e => handleDragOver(e, displayIdx)}
                onDrop={e => handleDrop(e, displayIdx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 py-3 cursor-grab active:cursor-grabbing transition-opacity ${
                  dragOverIdx === displayIdx && dragIdx !== displayIdx ? 'opacity-40' : 'opacity-100'
                }`}
              >
                {/* Drag handle */}
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                  <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                  <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                  <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                </svg>
                <EditableText
                  as="span"
                  value={label}
                  onSave={v => onSaveLabel(linkIdx, v)}
                  className="text-[17px] text-black font-normal"
                />
              </div>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={onClose}
                className={({ isActive }) =>
                  `block py-3 text-[17px] font-normal transition-colors ${
                    isActive ? "text-black" : "text-gray-800 hover:text-gray-400"
                  }`
                }
              >
                {label}
              </NavLink>
            )
          })}
          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                `block py-3 text-[17px] font-normal transition-colors ${
                  isActive ? "text-black" : "text-gray-800 hover:text-gray-400"
                }`
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
      </div>
    </>
  );
}

// ── Main Navbar ────────────────────────────────────────────────────────────
export default function Navbar() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { isEditing } = useEditMode();
  const { totalItems } = useCart();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [brandName, setBrandName] = useState("Epping Table Tennis");
  const [navLabels, setNavLabels] = useState(DEFAULT_NAV_LINKS.map(l => l.label));
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV_LINKS.map((_, i) => i));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    pagesAPI.getContent().then(r => {
      const c = r.data.content
      if (c.home_hero?.headline) setBrandName(c.home_hero.headline)
      if (Array.isArray(c.nav_links?.labels)) setNavLabels(c.nav_links.labels)
      if (Array.isArray(c.nav_links?.order)) setNavOrder(c.nav_links.order)
    }).catch(() => {})
  }, []);

  const saveBrandName = (v) => {
    setBrandName(v)
    pagesAPI.getContent().then(r => {
      const existing = r.data.content.home_hero ?? {}
      pagesAPI.updateContent('home_hero', { ...existing, headline: v }).catch(() => {})
    }).catch(() => {})
  }

  const saveNavLabel = (idx, v) => {
    const updated = [...navLabels]
    updated[idx] = v
    setNavLabels(updated)
    pagesAPI.updateContent('nav_links', { labels: updated, order: navOrder }).catch(() => {})
  }

  const saveNavOrder = (newOrder) => {
    setNavOrder(newOrder)
    pagesAPI.updateContent('nav_links', { labels: navLabels, order: newOrder }).catch(() => {})
  }

  const isHome = location.pathname === "/";
  const solid = !isHome || scrolled || hovered || menuOpen || accountOpen;

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-30 border-b transition-all duration-300 ${
          solid ? "bg-white border-gray-200" : "bg-transparent border-transparent"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Full-width relative container — logo is absolutely centered to the full navbar */}
        <div className="relative h-[84px] px-6 lg:px-10 flex items-center justify-between">

          {/* Left — Menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            className={`flex items-center gap-2 transition-colors duration-300 z-10 ${solid ? "text-black hover:text-gray-500" : "text-white hover:text-white/70"}`}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <span className="text-xs tracking-widest uppercase hidden sm:block">Menu</span>
          </button>

          {/* Center — Logo: absolutely centered to the full viewport width */}
          <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
            {isEditing ? (
              <>
                {/* Mobile: logo only */}
                <span className="sm:hidden flex items-center justify-center">
                  <ClubLogo solid={solid} />
                </span>
                {/* Desktop: editable text */}
                <EditableText
                  as="span"
                  value={brandName}
                  onSave={saveBrandName}
                  className={`hidden sm:inline font-display text-xl font-normal tracking-[0.25em] uppercase leading-none transition-colors duration-300 ${solid ? "text-black" : "text-white"}`}
                />
              </>
            ) : (
              <Link
                to="/"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                {/* Mobile: logo only */}
                <span className="sm:hidden flex items-center justify-center">
                  <ClubLogo solid={solid} />
                </span>
                {/* Desktop: text */}
                <span className={`hidden sm:inline font-display text-xl font-normal tracking-[0.25em] uppercase leading-none transition-colors duration-300 ${solid ? "text-black" : "text-white"}`}>
                  {brandName}
                </span>
              </Link>
            )}
          </div>

          {/* Right — Bag + Account icons */}
          <div className="flex items-center gap-4 z-10">
            {/* Shopping bag */}
            <button
              onClick={() => setBagOpen(true)}
              className={`relative transition-colors duration-300 ${solid ? "text-black hover:text-gray-500" : "text-white hover:text-white/70"}`}
              aria-label="Shopping bag"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
              </svg>
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black text-white text-[10px] rounded-full flex items-center justify-center leading-none">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </button>

            {/* Account */}
            <button
              onClick={() => setAccountOpen(true)}
              className={`flex items-center gap-2 transition-colors duration-300 ${solid ? "text-black hover:text-gray-500" : "text-white hover:text-white/70"}`}
              aria-label="Account"
            >
              {isAuthenticated ? (
                <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center text-white text-xs uppercase">
                  <IconPerson />
                </div>
              ) : (
                <IconPerson />
              )}
            </button>
          </div>
        </div>
      </header>

      <MenuPanel    open={menuOpen}    onClose={() => setMenuOpen(false)}    isAdmin={isAdmin} navLabels={navLabels} navOrder={navOrder} onSaveLabel={saveNavLabel} onReorder={saveNavOrder} />
      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />
      <ShoppingBag  open={bagOpen}     onClose={() => setBagOpen(false)} />
    </>
  );
}
