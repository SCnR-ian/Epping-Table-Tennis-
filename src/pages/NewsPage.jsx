import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { articlesAPI } from "@/api/api";
import { useClub } from "@/context/ClubContext";

const TABS = [
  { key: "", label: "All" },
  { key: "competition", label: "Competition" },
  { key: "news", label: "News" },
  { key: "achievement", label: "Achievement" },
];

const TYPE_LABEL = {
  competition: "Competition",
  news: "News",
  achievement: "Achievement",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { club } = useClub();

  const activeTab = searchParams.get("type") || "";
  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? "All";
  const clubName = club?.name ?? "Epping Table Tennis Club";

  useEffect(() => {
    setLoading(true);
    const params = activeTab ? { type: activeTab } : {};
    articlesAPI
      .getAll(params)
      .then((r) => setArticles(r.data.articles))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  const setTab = (key) => {
    if (key) setSearchParams({ type: key });
    else setSearchParams({});
  };

  const hero = articles[0] ?? null;
  const rest = articles.slice(1);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="text-center pt-20 pb-14 px-4">
        {activeTab ? (
          <>
            <p className="text-sm text-gray-500 mb-2">{clubName}</p>
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900">
              {activeLabel}
            </h1>
          </>
        ) : (
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900">
            The World · {clubName}
          </h1>
        )}
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────── */}
      <div className="pb-6">
        <div className="flex items-center justify-center gap-8 sm:gap-12 overflow-x-auto px-4 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap text-sm transition-colors pb-0.5 ${
                activeTab === t.key
                  ? "font-semibold text-gray-900 underline underline-offset-4"
                  : "font-normal text-gray-500 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-24 text-gray-400 text-sm">
            No articles yet.
          </div>
        ) : (
          <>
            {/* ── Hero ─────────────────────────────────────────── */}
            {hero && (
              <div
                className="cursor-pointer mb-12 group"
                onClick={() => navigate(`/news/${hero.id}`)}
              >
                {hero.image_data ? (
                  <div className="relative overflow-hidden aspect-[16/7] bg-gray-100">
                    <img
                      src={hero.image_data}
                      alt={hero.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-8 text-white text-center">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] mb-3 opacity-75">
                        {TYPE_LABEL[hero.type]}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-light leading-snug max-w-2xl mx-auto">
                        {hero.title}
                      </h2>
                      {hero.subtitle && (
                        <p className="mt-2 text-sm opacity-70 max-w-xl mx-auto">
                          {hero.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 min-h-[320px] flex flex-col items-center justify-center p-12 text-center group-hover:bg-gray-150 transition-colors">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400 mb-3">
                      {TYPE_LABEL[hero.type]}
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-light text-gray-900">
                      {hero.title}
                    </h2>
                    {hero.subtitle && (
                      <p className="mt-2 text-gray-500">{hero.subtitle}</p>
                    )}
                  </div>
                )}
                {/* Caption below hero */}
                <div className="mt-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400 mb-1">
                    {TYPE_LABEL[hero.type]}
                  </p>
                  <h3 className="text-lg font-light text-gray-900 group-hover:underline">
                    {hero.title}
                  </h3>
                  {hero.subtitle && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {hero.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(hero.published_at)}
                  </p>
                </div>
              </div>
            )}

            {/* ── Grid ─────────────────────────────────────────── */}
            {rest.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {rest.map((a) => (
                  <div
                    key={a.id}
                    className="cursor-pointer group"
                    onClick={() => navigate(`/news/${a.id}`)}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-gray-100 mb-4">
                      {a.image_data ? (
                        <img
                          src={a.image_data}
                          alt={a.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200 group-hover:bg-gray-300 transition-colors">
                          <span className="text-gray-400 text-xs uppercase tracking-widest">
                            {TYPE_LABEL[a.type]}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 mb-1">
                      {TYPE_LABEL[a.type]}
                    </p>
                    <h3 className="text-base font-light text-gray-900 leading-snug group-hover:underline">
                      {a.title}
                    </h3>
                    {a.subtitle && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {a.subtitle}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDate(a.published_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
