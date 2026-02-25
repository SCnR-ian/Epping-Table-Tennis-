import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md animate-slide-up">
        {/* Bouncing ball */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="w-24 h-24 rounded-full bg-brand-500/10 border-2 border-brand-500/20 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-brand-500/20 ball-bounce" />
          </div>
        </div>

        <p className="font-display text-9xl text-brand-500/20 tracking-wider leading-none select-none">404</p>
        <h1 className="font-display text-3xl text-white tracking-wider mt-2 mb-3">Out of Bounds!</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          This page has gone off the table. Let's get you back in the game.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary">← Back to Home</Link>
          <Link to="/booking" className="btn-outline">Book a Court</Link>
        </div>
      </div>
    </div>
  )
}
