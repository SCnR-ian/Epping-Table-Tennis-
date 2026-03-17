import { useState } from "react";
import BookingPage    from "./BookingPage";
import SocialPlayPage from "./SocialPlayPage";

const TABS = [
  { id: "booking",    label: "Book a Court",   icon: "🏓" },
  { id: "socialplay", label: "Social Play",     icon: "👥" },
];

export default function PlayPage() {
  const [tab, setTab] = useState("booking");

  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-4 -mt-16 bg-court-pattern text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-court-dark via-court-mid/50 to-brand-900/20 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4">
            Get on the Table
          </p>
          <h1 className="section-title text-5xl md:text-6xl mb-6">Play</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Book a court for your own session or join one of our social play
            nights — it's all here.
          </p>
        </div>
      </section>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="sticky top-16 z-30 bg-court-dark/95 backdrop-blur border-b border-court-light">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-brand-500 text-white shadow"
                  : "text-slate-400 hover:text-white hover:bg-court-light"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="min-h-screen">
        {tab === "booking"    && <BookingPage    embedded />}
        {tab === "socialplay" && <SocialPlayPage embedded />}
      </div>
    </div>
  );
}
