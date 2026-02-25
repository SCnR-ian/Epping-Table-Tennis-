import { useState, useEffect } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { to: "/", label: "Home", public: true },
  { to: "/coaching", label: "Coaching", public: true },
  { to: "/booking", label: "Booking", public: true },
  { to: "/dashboard", label: "Dashboard", public: false },
];

export default function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
    setMobileOpen(false);
  };

  const visibleLinks = NAV_LINKS.filter((l) => l.public || isAuthenticated);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-court-dark/95 backdrop-blur-md shadow-lg shadow-black/30"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 group"
            onClick={() => setMobileOpen(false)}
          >
            <span className="text-2xl font-display text-white tracking-widest group-hover:text-brand-400 transition-colors">
              Epping Table Tennis Club
            </span>
            <span className="text-[10px] font-body font-medium text-slate-500 uppercase tracking-widest mt-1 hidden sm:block">
              TT Club
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {visibleLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `nav-link pb-1 ${isActive ? "nav-link-active" : ""}`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `nav-link pb-1 ${isActive ? "nav-link-active" : ""}`
                }
              >
                Admin
              </NavLink>
            )}
          </div>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center font-semibold text-white text-xs uppercase">
                    {user?.name?.[0] ?? "U"}
                  </div>
                  <span className="hidden lg:block font-medium">
                    {user?.name}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn-secondary text-sm py-1.5 px-4"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-outline  text-sm py-1.5 px-4">
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn-primary  text-sm py-1.5 px-4"
                >
                  Join Now
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <div className="w-5 space-y-1.5">
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={`md:hidden transition-all duration-300 overflow-hidden ${
          mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-court-mid border-t border-court-light px-4 py-4 space-y-1">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-500/10 text-brand-400"
                    : "text-slate-300 hover:bg-court-light hover:text-white"
                }`
              }
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-500/10 text-brand-400"
                    : "text-slate-300 hover:bg-court-light hover:text-white"
                }`
              }
              onClick={() => setMobileOpen(false)}
            >
              Admin Panel
            </NavLink>
          )}

          <div className="pt-3 border-t border-court-light mt-3 flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300"
                  onClick={() => setMobileOpen(false)}
                >
                  <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                    {user?.name?.[0] ?? "U"}
                  </div>
                  {user?.name}
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn-secondary text-sm py-2"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn-outline text-sm py-2 text-center"
                  onClick={() => setMobileOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn-primary text-sm py-2 text-center"
                  onClick={() => setMobileOpen(false)}
                >
                  Join Now
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
