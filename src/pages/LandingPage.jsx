import React, { useState, useEffect, useRef } from "react";

// ── Scroll animation hook ──────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ── Content ────────────────────────────────────────────────────────────────────
const C = {
  en: {
    nav: {
      features: "Features",
      pricing: "Pricing",
      login: "Log in",
      cta: "Get your club",
    },
    hero: {
      pre: "Table tennis club management",
      title: "Run a better\nclub.",
      sub: "Flinther gives your club a professional booking system, coaching platform, and member portal — all under your own branded URL.",
      cta: "Get your club free",
      hint: "No credit card · Live in 5 minutes",
    },
    logos: { label: "Built for clubs like these" },
    feat: {
      title: "Everything a club needs.",
      sub: "One platform. No spreadsheets. No chaos.",
      items: [
        {
          title: "Court booking",
          sub: "Members book online 24/7. Automatic conflict detection, real-time availability, and Stripe payments built in.",
          emoji: "🏓",
        },
        {
          title: "Coaching system",
          sub: "Schedule private and group sessions, manage coach calendars, track attendance, and automate session reminders.",
          emoji: "🎯",
        },
        {
          title: "Member portal",
          sub: "Every member gets their own account. Book courts, view coaching history, and manage their profile from any device.",
          emoji: "👥",
        },
        {
          title: "Online payments",
          sub: "Accept card, Apple Pay, and Google Pay via Stripe. Automatic receipts, refunds, and a full financial dashboard.",
          emoji: "💳",
        },
        {
          title: "Social play",
          sub: "Run open-table sessions and round-robins. Members sign up with one tap, you see who's coming in real time.",
          emoji: "🤝",
        },
        {
          title: "Analytics",
          sub: "See court utilisation, revenue trends, and your most active members — at a glance, every day.",
          emoji: "📊",
        },
      ],
    },
    how: {
      title: "From signup to live\nin minutes.",
      steps: [
        {
          n: "01",
          title: "Create an account",
          sub: "Sign up with your email. No credit card needed to start.",
        },
        {
          n: "02",
          title: "Set up your club",
          sub: "Fill in your club name, address, courts, and opening hours.",
        },
        {
          n: "03",
          title: "Go live",
          sub: "Your club gets yourname.flinther.com. Share it and start taking bookings.",
        },
      ],
    },
    pricing: {
      title: "Simple pricing.",
      sub: "Start free. Upgrade when you're ready.",
      popular: "Most popular",
      plans: [
        {
          name: "Free",
          price: "$0",
          period: "/mo",
          desc: "For small clubs getting started.",
          dark: false,
          features: [
            "Up to 50 members",
            "2 courts",
            "Court booking",
            "Basic analytics",
          ],
          cta: "Start free",
        },
        {
          name: "Pro",
          price: "Coming soon",
          period: "",
          desc: "For serious clubs.",
          dark: true,
          features: [
            "Unlimited members",
            "Unlimited courts",
            "Coaching system",
            "Online payments",
            "Analytics",
            "Priority support",
          ],
          cta: "Join waitlist",
        },
        {
          name: "Enterprise",
          price: "Custom",
          period: "",
          desc: "For multi-venue operators.",
          dark: false,
          features: [
            "Multiple venues",
            "Custom domain",
            "API access",
            "Dedicated support",
          ],
          cta: "Contact us",
        },
      ],
    },
    cta2: {
      title: "Your club deserves better.",
      sub: "Join clubs already running on Flinther.",
      btn: "Get your club free",
    },
    footer: {
      tag: "Club management for table tennis.",
      copy: "© 2026 Flinther",
    },
  },
  zh: {
    nav: { features: "功能", pricing: "定價", login: "登入", cta: "申請球館" },
    hero: {
      pre: "桌球館管理系統",
      title: "讓你的球館\n更上一層。",
      sub: "Flinther 給你的球館一套專業的預訂系統、教練平台與會員入口——全都在你專屬的網址底下。",
      cta: "免費申請球館",
      hint: "無需信用卡 · 5 分鐘上線",
    },
    logos: { label: "為這樣的球館而生" },
    feat: {
      title: "球館需要的一切。",
      sub: "一個平台。不再用試算表。不再一團亂。",
      items: [
        {
          title: "球桌預訂",
          sub: "會員全天候線上預訂，自動衝突偵測、即時空位、Stripe 收款全部內建。",
          emoji: "🏓",
        },
        {
          title: "教練系統",
          sub: "安排一對一與團體課、管理教練行事曆、追蹤出席、自動發送課程提醒。",
          emoji: "🎯",
        },
        {
          title: "會員入口",
          sub: "每位會員有自己的帳號，在任何裝置上預訂球桌、查看課程記錄、管理個人資料。",
          emoji: "👥",
        },
        {
          title: "線上付款",
          sub: "透過 Stripe 接受刷卡、Apple Pay 和 Google Pay，自動收據、退款與財務報告。",
          emoji: "💳",
        },
        {
          title: "社交活動",
          sub: "舉辦開放場次和循環賽，會員一鍵報名，你即時掌握出席狀況。",
          emoji: "🤝",
        },
        {
          title: "數據分析",
          sub: "每天一眼掌握球桌使用率、營收趨勢與最活躍的會員。",
          emoji: "📊",
        },
      ],
    },
    how: {
      title: "從申請到上線，\n只需幾分鐘。",
      steps: [
        {
          n: "01",
          title: "建立帳號",
          sub: "用 Email 註冊，開始不需要信用卡。",
        },
        {
          n: "02",
          title: "設定球館",
          sub: "填入球館名稱、地址、球桌數量與營業時間。",
        },
        {
          n: "03",
          title: "正式上線",
          sub: "球館獲得 yourname.flinther.com，分享出去，開始接受預訂。",
        },
      ],
    },
    pricing: {
      title: "簡單的定價。",
      sub: "免費開始，準備好了再升級。",
      popular: "最受歡迎",
      plans: [
        {
          name: "免費版",
          price: "$0",
          period: "/月",
          desc: "適合剛起步的小型球館。",
          dark: false,
          features: ["最多 50 位會員", "2 張球桌", "球桌預訂", "基本數據分析"],
          cta: "免費開始",
        },
        {
          name: "Pro",
          price: "即將推出",
          period: "",
          desc: "適合認真經營的球館。",
          dark: true,
          features: [
            "無限會員",
            "無限球桌",
            "教練系統",
            "線上付款",
            "數據分析",
            "優先支援",
          ],
          cta: "加入候補名單",
        },
        {
          name: "企業版",
          price: "自訂報價",
          period: "",
          desc: "適合多場館經營者。",
          dark: false,
          features: ["多場館管理", "自訂網域", "API 存取", "專屬支援"],
          cta: "聯絡我們",
        },
      ],
    },
    cta2: {
      title: "你的球館值得更好的。",
      sub: "加入已在使用 Flinther 的球館。",
      btn: "免費申請球館",
    },
    footer: { tag: "桌球館管理系統", copy: "© 2026 Flinther" },
  },
};

// ── Animated section wrapper ───────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }) {
  const [ref, visible] = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ── Screenshots carousel ──────────────────────────────────────────────────────
const SLIDES = [
  { src: "/ss1.png", alt: "Admin dashboard", url: "epping.flinther.com/admin" },
  {
    src: "/ss2.png",
    alt: "Booking calendar",
    url: "epping.flinther.com/admin",
  },
  { src: "/ss3.png", alt: "Venue", url: null },
];

function Screenshots() {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const prev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setIdx((i) => (i + 1) % SLIDES.length);

  return (
    <div className="w-full max-w-5xl mx-auto select-none">
      {/* Card */}
      <div className="rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.10)] border border-gray-200">
        {/* Chrome bar — always reserve space to prevent height jump */}
        <div className="bg-[#f0f0ee] px-5 py-3 flex items-center gap-3 border-b border-gray-200">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 bg-white rounded-md px-4 py-1 text-xs text-gray-400 font-mono max-w-xs mx-auto text-center">
            {slide.url ?? ""}
          </div>
        </div>
        {/* Fixed aspect ratio so height never changes between slides */}
        <div className="relative w-full" style={{ paddingBottom: "50%" }}>
          {SLIDES.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt={s.alt}
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
              style={{
                opacity: i === idx ? 1 : 0,
                pointerEvents: i === idx ? "auto" : "none",
              }}
              loading="lazy"
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-5 mt-6">
        <button
          onClick={prev}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-400 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? "w-5 h-2 bg-gray-900" : "w-2 h-2 bg-gray-200 hover:bg-gray-400"}`}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-400 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────
function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b border-gray-100 py-5 cursor-pointer"
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex justify-between items-start gap-4">
        <span className="font-medium text-gray-900">{q}</span>
        <span
          className={`shrink-0 text-gray-400 text-lg leading-none transition-transform duration-200 mt-0.5 ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </div>
      {open && (
        <p className="mt-3 text-sm text-gray-500 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [lang, setLang] = useState("zh");
  const c = C[lang];

  return (
    <div
      className="bg-white text-gray-900 antialiased overflow-x-hidden"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-[60px] flex items-center justify-between">
          <span
            className="font-medium text-xl tracking-tight"
            style={{ fontFamily: '"Kanit", sans-serif' }}
          >
            Flinther
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-500">
            <a
              href="#features"
              className="hover:text-gray-900 transition-colors"
            >
              {c.nav.features}
            </a>
            <a
              href="#pricing"
              className="hover:text-gray-900 transition-colors"
            >
              {c.nav.pricing}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {lang === "en" ? "中文" : "EN"}
            </button>
            <a
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 transition-colors"
            >
              {c.nav.login}
            </a>
            <a
              href="/register"
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-black transition-colors font-medium"
            >
              {c.nav.cta}
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-40 pb-24 px-6 text-center max-w-4xl mx-auto">
        <div
          className="inline-block text-xs font-medium text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-full mb-8"
          style={{ opacity: 1 }}
        >
          {c.hero.pre}
        </div>
        <h1
          className="text-6xl md:text-8xl font-normal leading-[0.95] tracking-[-0.04em] text-gray-900 mb-8 whitespace-pre-line"
          style={{ fontFamily: '"Kanit", sans-serif' }}
        >
          {c.hero.title}
        </h1>
        <p className="text-lg md:text-xl text-gray-500 leading-relaxed max-w-xl mx-auto mb-10">
          {c.hero.sub}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/register"
            className="bg-gray-900 text-white px-8 py-3.5 rounded-xl font-medium text-sm hover:bg-black transition-colors"
          >
            {c.hero.cta}
          </a>
          <a
            href="#features"
            className="text-sm text-gray-500 hover:text-gray-900 px-6 py-3.5 transition-colors"
          >
            {lang === "en" ? "See how it works →" : "了解功能 →"}
          </a>
        </div>
        <p className="text-xs text-gray-400 mt-4">{c.hero.hint}</p>
      </section>

      {/* ── Screenshots ── */}
      <section className="pb-28 px-6">
        <Reveal>
          <Screenshots />
        </Reveal>
      </section>

      {/* ── Features ── */}
      <section
        id="features"
        className="py-28 px-6 bg-[#fafafa] border-y border-gray-100"
      >
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-normal tracking-tight text-gray-900 mb-4"
              style={{ fontFamily: '"Kanit", sans-serif' }}
            >
              {c.feat.title}
            </h2>
            <p className="text-gray-500">{c.feat.sub}</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-4">
            {c.feat.items.map((f, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all h-full">
                  <div className="text-3xl mb-4">{f.emoji}</div>
                  <h3 className="font-medium text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {f.sub}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-normal tracking-tight text-gray-900 whitespace-pre-line"
              style={{ fontFamily: '"Kanit", sans-serif' }}
            >
              {c.how.title}
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-12">
            {c.how.steps.map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div>
                  <p
                    className="text-5xl font-normal text-gray-100 mb-4"
                    style={{ fontFamily: '"Kanit", sans-serif' }}
                  >
                    {s.n}
                  </p>
                  <h3 className="font-medium text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {s.sub}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        id="pricing"
        className="py-28 px-6 bg-[#fafafa] border-y border-gray-100"
      >
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-normal tracking-tight text-gray-900 mb-4"
              style={{ fontFamily: '"Kanit", sans-serif' }}
            >
              {c.pricing.title}
            </h2>
            <p className="text-gray-500">{c.pricing.sub}</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-4">
            {c.pricing.plans.map((p, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div
                  className={`rounded-2xl p-7 border relative flex flex-col h-full ${p.dark ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-100"}`}
                >
                  {p.dark && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-medium bg-white text-gray-900 px-3 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                      {c.pricing.popular}
                    </span>
                  )}
                  <div className="mb-6">
                    <p
                      className={`text-xs font-medium tracking-widest uppercase mb-3 ${p.dark ? "text-gray-500" : "text-gray-400"}`}
                    >
                      {p.name}
                    </p>
                    <p
                      className={`text-4xl font-normal mb-1 ${p.dark ? "text-white" : "text-gray-900"}`}
                      style={{ fontFamily: '"Kanit", sans-serif' }}
                    >
                      {p.price}
                      <span
                        className={`text-sm font-normal ml-1 ${p.dark ? "text-gray-500" : "text-gray-400"}`}
                      >
                        {p.period}
                      </span>
                    </p>
                    <p
                      className={`text-sm ${p.dark ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {p.desc}
                    </p>
                  </div>
                  <ul className="space-y-2.5 mb-8 flex-1">
                    {p.features.map((f, j) => (
                      <li
                        key={j}
                        className={`flex items-center gap-2 text-sm ${p.dark ? "text-gray-300" : "text-gray-600"}`}
                      >
                        <span
                          className={`text-base ${p.dark ? "text-gray-500" : "text-gray-300"}`}
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="/register"
                    className={`block text-center py-3 rounded-xl text-sm font-medium transition-colors ${p.dark ? "bg-white text-gray-900 hover:bg-gray-100" : "bg-gray-900 text-white hover:bg-black"}`}
                  >
                    {p.cta}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-32 px-6 bg-gray-900">
        <Reveal className="text-center max-w-xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-normal tracking-tight text-white mb-5 whitespace-pre-line"
            style={{ fontFamily: '"Kanit", sans-serif' }}
          >
            {c.cta2.title}
          </h2>
          <p className="text-gray-400 mb-10">{c.cta2.sub}</p>
          <a
            href="/register"
            className="inline-block bg-white text-gray-900 px-8 py-4 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors"
          >
            {c.cta2.btn}
          </a>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="font-medium text-gray-900"
              style={{ fontFamily: '"Kanit", sans-serif' }}
            >
              Flinther
            </span>
            <span className="text-sm text-gray-400">{c.footer.tag}</span>
          </div>
          <p className="text-xs text-gray-400">{c.footer.copy}</p>
        </div>
      </footer>
    </div>
  );
}
