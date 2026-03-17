import { Link } from "react-router-dom";

const LINKS = {
  Club: [
    ["Home", "/"],
    ["Book a Court", "/booking"],
  ],
  Account: [
    ["Login", "/login"],
    ["Register", "/register"],
    ["Dashboard", "/dashboard"],
  ],
  Info: [
    ["Schedule", "/"],
    ["Contact", "/"],
    ["Privacy", "/"],
  ],
};

export default function Footer() {
  return (
    <footer className="bg-court-mid border-t border-court-light mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <span className="font-display text-2xl text-white tracking-widest">
              EPPING<span className="text-brand-500"> TT</span>
            </span>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-xs">
              Sydney's premier table tennis club — built by players, for players.
            </p>
            <div className="flex gap-3 mt-4">
              {/* Placeholder social icons */}
              {["FB", "TW", "IG"].map((s) => (
                <a
                  key={s}
                  href="#"
                  className="w-8 h-8 rounded-full bg-court-light flex items-center justify-center text-xs text-slate-400 hover:bg-brand-500 hover:text-white transition-all"
                >
                  {s}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-normal text-slate-500 uppercase tracking-widest mb-4">
                {title}
              </h4>
              <ul className="space-y-2">
                {links.map(([label, to]) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="text-sm text-slate-400 hover:text-brand-400 transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-court-light flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
          <p>
            © {new Date().getFullYear()} Epping Table Tennis Club. All rights
            reserved.
          </p>
          <p>Built with ❤️ for the love of the game.</p>
        </div>
      </div>
    </footer>
  );
}
