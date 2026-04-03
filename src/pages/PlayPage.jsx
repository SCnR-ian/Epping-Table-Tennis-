import SocialPlayPage from './SocialPlayPage'

export default function PlayPage() {
  return (
    <div className="bg-white">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex items-center justify-center pt-20 pb-12 px-6 border-b border-gray-100">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-display text-4xl md:text-6xl font-normal text-black mb-6 leading-tight">
            Social Play
          </h1>
          <p className="text-gray-500 text-base md:text-lg max-w-md mx-auto leading-relaxed mb-10">
            Drop-in sessions open to all members — come along, meet other players, and enjoy some casual table tennis.
          </p>
          <a
            href="#sessions"
            className="inline-block bg-black text-white text-sm tracking-widest uppercase px-10 py-4 rounded-full hover:bg-gray-800 transition-colors duration-200"
          >
            View Sessions
          </a>
        </div>
      </section>

      {/* ── Sessions ─────────────────────────────────────────────────────── */}
      <div id="sessions">
        <SocialPlayPage embedded />
      </div>

    </div>
  )
}
