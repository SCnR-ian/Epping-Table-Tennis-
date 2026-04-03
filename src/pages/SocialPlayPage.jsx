import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { socialAPI } from "@/api/api";
import SocialPlayCard from "@/components/common/SocialPlayCard";

const PAGE_SIZE = 6;

export default function SocialPlayPage({ embedded = false }) {
  const { isAuthenticated, user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");

  const fetchSessions = () =>
    socialAPI
      .getSessions()
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleJoin = async (id) => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    try {
      await socialAPI.join(id);
      await fetchSessions();
    } catch (err) {
      alert(err.response?.data?.message ?? "Could not join session.");
    }
  };

  const handleLeave = async (id) => {
    try {
      await socialAPI.leave(id);
      await fetchSessions();
    } catch {
      alert("Could not leave session.");
    }
  };

  const sorted = useMemo(() => {
    const now = Date.now();
    const isPast = (s) => new Date(`${s.date}T${s.end_time}`) < now;
    return [...sessions].sort((a, b) => {
      const aPast = isPast(a),
        bPast = isPast(b);
      if (aPast !== bPast) return aPast ? 1 : -1;
      return (
        new Date(`${a.date}T${a.start_time}`) -
        new Date(`${b.date}T${b.start_time}`)
      );
    });
  }, [sessions]);

  const filtered = selectedDate
    ? sorted.filter((s) => s.date?.slice(0, 10) === selectedDate)
    : sorted;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageSlice = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className={embedded ? "" : "bg-white"}>
      <div id="sessions" className="max-w-6xl mx-auto px-6 py-12">
        {/* Login notice */}
        {!isAuthenticated && (
          <div className="mb-8 text-center text-sm text-gray-500 border border-gray-200 py-3 px-6 inline-block mx-auto">
            <a href="/login" className="underline text-black">
              Log in
            </a>{" "}
            to join a session and see who else is coming.
          </div>
        )}

        {/* Date filter */}
        {!loading && sorted.length > 0 && (
          <div className="flex items-center justify-center gap-4 mb-10">
            <span className="text-xs tracking-widest uppercase text-gray-400">
              Filter by date
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(0);
              }}
              className="border border-gray-300 text-sm px-3 py-1.5 text-black focus:outline-none focus:border-black transition-colors"
            />
            {selectedDate && (
              <button
                onClick={() => {
                  setSelectedDate("");
                  setPage(0);
                }}
                className="text-xs text-gray-400 hover:text-black transition-colors underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-20">
            Loading sessions…
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-300 text-6xl mb-6">🏓</p>
            <p className="text-gray-500 text-lg mb-2">
              {selectedDate
                ? "No sessions on this date."
                : "No upcoming sessions."}
            </p>
            {!selectedDate && (
              <p className="text-gray-400 text-sm">
                Check back later — an admin will schedule the next one.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {pageSlice.map((s) => {
                const isPast = new Date(`${s.date}T${s.end_time}`) < new Date();
                return (
                  <SocialPlayCard
                    key={s.id}
                    session={{ ...s, joined_user_id: user?.id }}
                    isAuthenticated={isAuthenticated}
                    isPast={isPast}
                    onJoin={() => handleJoin(s.id)}
                    onLeave={() => handleLeave(s.id)}
                  />
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-6 mt-12">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs tracking-widest uppercase text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-gray-400">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page === totalPages - 1}
                  className="text-xs tracking-widest uppercase text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
