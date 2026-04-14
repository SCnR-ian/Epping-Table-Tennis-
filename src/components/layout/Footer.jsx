import { Link } from "react-router-dom";
import { useClub } from "@/context/ClubContext";

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
];

const DEFAULT_CONTACT = {
  phone:   "(02) 9876 5432",
  email:   "info@eppingttclub.com.au",
  wechat:  "",
}

function buildContactItems(settings) {
  const phone  = settings?.contactPhone || DEFAULT_CONTACT.phone
  const email  = settings?.contactEmail || DEFAULT_CONTACT.email
  const wechat = settings?.wechat       || DEFAULT_CONTACT.wechat
  return [
    {
      label: phone,
      href:  `tel:${phone.replace(/\D/g, '')}`,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      ),
    },
    {
      label: email,
      href:  `mailto:${email}`,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
    },
    ...(wechat ? [{
      label: `WeChat: ${wechat}`,
      href:  null,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.015.806-.035-.751-2.578.257-5.39 2.65-7.182C10.9 8.01 9.895 7.659 8.69 7.659c-.386 0-.77.031-1.144.09a.527.527 0 01-.09.008.55.55 0 01-.547-.55.55.55 0 01.547-.549c.42 0 .841.034 1.247.099 2.042-2.17 5.077-3.57 8.448-3.57h.05C15.062 2.88 11.998 2.188 8.691 2.188zm-2.48 4.53a.826.826 0 110 1.652.826.826 0 010-1.652zm4.95 0a.826.826 0 110 1.652.826.826 0 010-1.652zM24 14.465c0-3.399-3.188-6.155-7.124-6.155-3.936 0-7.125 2.756-7.125 6.155 0 3.4 3.189 6.155 7.125 6.155.836 0 1.64-.12 2.385-.337a.696.696 0 01.572.078l1.522.89a.261.261 0 00.134.043.236.236 0 00.232-.236c0-.058-.023-.113-.038-.17l-.312-1.184a.472.472 0 01.17-.532C23.073 18.092 24 16.368 24 14.465zm-9.305-.34a.66.66 0 110-1.32.66.66 0 010 1.32zm4.36 0a.66.66 0 110-1.32.66.66 0 010 1.32z"/>
        </svg>
      ),
    }] : []),
  ]
}


export default function Footer() {
  const { club } = useClub() ?? {}
  const clubName    = club?.name    ?? 'Epping Table Tennis Club'
  const contactItems = buildContactItems(club?.settings)

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-8">

        {/* Main columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-12 border-b border-gray-100">

          {/* Contact column */}
          <div className="text-center">
            <h4 className="text-[11px] tracking-[0.15em] uppercase text-black font-normal mb-5">
              Contact
            </h4>
            <ul className="space-y-3">
              {contactItems.map(({ label, href, icon }) => (
                <li key={label}>
                  {href ? (
                    <a href={href} className="inline-flex items-center gap-2.5 text-sm text-gray-700 hover:text-black transition-colors font-light">
                      <span className="text-gray-500">{icon}</span>
                      {label}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-2.5 text-sm text-gray-700 font-light">
                      <span className="text-gray-500">{icon}</span>
                      {label}
                    </span>
                  )}
                </li>
              ))}
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

        {/* Brand name — LV style bottom stamp */}
        <p className="mt-10 text-center font-display text-2xl tracking-[0.3em] uppercase text-black">
          {clubName}
        </p>

      </div>
    </footer>
  );
}
