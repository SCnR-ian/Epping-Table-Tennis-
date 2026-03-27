import SocialPlayPage from "./SocialPlayPage";

export default function PlayPage() {
  return (
    <div className="page-wrapper">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-4 -mt-16 bg-court-pattern text-center">
        <img src="https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=1920&q=80"
          alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-court-dark/60 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-brand-400 font-normal text-sm uppercase tracking-widest mb-4">
            Get on the Table
          </p>
          <h1 className="section-title text-5xl md:text-6xl mb-6">Social Play</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Join one of our social play nights — open to all members.
          </p>
        </div>
      </section>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="min-h-screen">
        <SocialPlayPage embedded />
      </div>
    </div>
  );
}
