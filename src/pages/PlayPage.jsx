import { useState } from 'react'
import SocialPlayPage from './SocialPlayPage'
import BookingPage from './BookingPage'

const TABS = ['Book Table', 'Social Play']

export default function PlayPage() {
  const [tab, setTab] = useState('Book Table')

  return (
    <div className="bg-white min-h-screen">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="flex items-center justify-center pt-20 pb-12 px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-display text-4xl md:text-6xl font-normal text-black mb-6 leading-tight">
            Play
          </h1>
          <p className="text-gray-500 text-base md:text-lg max-w-md mx-auto leading-relaxed">
            Book a table for your own session, or join a drop-in social play session with other members.
          </p>
        </div>
      </section>

      {/* ── Tab switcher ───────────────────────────────────────────────────── */}
      <div className="flex justify-center gap-10 mb-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 text-sm tracking-widest uppercase border-b-2 transition-colors ${
              tab === t
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {tab === 'Book Table' && (
        <BookingPage embedded />
      )}
      {tab === 'Social Play' && (
        <SocialPlayPage embedded />
      )}

    </div>
  )
}
