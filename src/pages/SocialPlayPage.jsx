import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { socialAPI, paymentsAPI } from "@/api/api";
import SocialPlayCard from "@/components/common/SocialPlayCard";

const PAGE_SIZE = 6;

// ── Card Auth Modal (for paid social play sessions) ──────────────────────────
function CardAuthModal({ session, onSuccess, onClose }) {
  const [paymentMode,    setPaymentMode]    = useState(null);   // null = picking, 'immediate' | 'hold'
  const [clientSecret,   setClientSecret]   = useState(null);
  const [amountCents,    setAmountCents]     = useState(0);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [cardElement,    setCardElement]    = useState(null);
  const [paymentError,   setPaymentError]   = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [processing,     setProcessing]     = useState(false);
  const cardRef = useRef(null);

  // Once mode is chosen, create the authorization intent
  useEffect(() => {
    if (!paymentMode) return;
    setLoading(true);
    setPaymentError(null);
    paymentsAPI.authorize({ type: 'social', session_id: session.id, payment_mode: paymentMode })
      .then(({ data }) => { setClientSecret(data.clientSecret); setAmountCents(data.amount); })
      .catch(err => setPaymentError(err.response?.data?.message || "Could not start authorization."))
      .finally(() => setLoading(false));
  }, [paymentMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount Stripe card element once we have the clientSecret
  useEffect(() => {
    if (!clientSecret || cardElement) return;
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey) { setPaymentError("Stripe is not configured."); return; }
    const stripe = window.Stripe?.(stripeKey);
    if (!stripe) { setPaymentError("Payment system failed to load."); return; }
    setStripeInstance(stripe);
    const elements = stripe.elements();
    const card = elements.create("card", {
      style: {
        base: { color: "#111827", fontFamily: "DM Sans, sans-serif", fontSize: "16px", "::placeholder": { color: "#9ca3af" } },
        invalid: { color: "#ef4444" },
      },
    });
    setTimeout(() => {
      if (cardRef.current) { card.mount(cardRef.current); setCardElement(card); }
    }, 50);
    return () => { card.destroy(); setCardElement(null); };
  }, [clientSecret]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthorize = async () => {
    if (!stripeInstance || !cardElement || !clientSecret) return;
    setProcessing(true);
    setPaymentError(null);
    try {
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (error) { setPaymentError(error.message); return; }
      if (paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture") {
        await paymentsAPI.confirmAuthorize(paymentIntent.id);
        onSuccess();
      } else {
        setPaymentError("Unexpected status. Please try again.");
      }
    } catch (err) {
      setPaymentError(err.response?.data?.message || "Authorization failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const aud = `AUD $${(amountCents / 100).toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-black text-base font-normal">Join Session</h3>
            <p className="text-gray-500 text-xs mt-0.5">{session.title || "Social Play"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors text-xl leading-none">×</button>
        </div>

        {/* Step 1: pick payment mode */}
        {!paymentMode && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest">How would you like to pay?</p>
            <button
              onClick={() => setPaymentMode('immediate')}
              className="w-full text-left border border-gray-200 rounded-xl px-4 py-3.5 hover:border-black transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Pay now (card)</p>
              <p className="text-xs text-gray-400 mt-0.5">Card charged immediately · full refund if you cancel</p>
            </button>
            <button
              onClick={() => setPaymentMode('hold')}
              className="w-full text-left border border-gray-200 rounded-xl px-4 py-3.5 hover:border-black transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Pay in person (cash)</p>
              <p className="text-xs text-gray-400 mt-0.5">Card held as guarantee · only charged if you don't show up</p>
            </button>
            <button onClick={onClose} className="w-full border border-gray-200 text-gray-500 text-xs tracking-widest uppercase py-3 rounded-full hover:border-black transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* Step 2: card details */}
        {paymentMode && (
          <>
            {/* Payment notice */}
            <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${paymentMode === 'immediate' ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
              {paymentMode === 'immediate'
                ? <>Your card will be <strong>charged immediately</strong>. Full refund if you cancel in time.</>
                : <>Card held as guarantee only. <strong>Pay cash on the day.</strong> Card charged only if you don't show up.</>
              }
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm text-center py-4">Loading…</p>
            ) : paymentError && !clientSecret ? (
              <p className="text-red-500 text-sm text-center">{paymentError}</p>
            ) : (
              <>
                <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-4">
                  <span className="text-gray-500">{paymentMode === 'immediate' ? 'Amount' : 'Hold amount'}</span>
                  <span className="text-black font-medium">{aud}</span>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Card Details</label>
                  <div ref={cardRef} className="border border-gray-300 rounded-xl px-4 py-3.5 min-h-[46px]" />
                  {paymentError && <p className="text-red-500 text-xs mt-2">{paymentError}</p>}
                </div>

                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  Secured by Stripe. Card details never stored on our servers.
                </p>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setPaymentMode(null); setClientSecret(null); setCardElement(null); }} className="flex-1 border border-gray-300 text-gray-700 text-sm tracking-widest uppercase py-3 rounded-full hover:border-black transition-colors">
                    Back
                  </button>
                  <button
                    onClick={handleAuthorize}
                    disabled={processing || !cardElement}
                    className="flex-1 bg-black text-white text-sm tracking-widest uppercase py-3 rounded-full hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {processing ? "Processing…" : paymentMode === 'immediate' ? "Pay & Join" : "Hold & Join"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SocialPlayPage({ embedded = false }) {
  const { isAuthenticated, user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [authSession, setAuthSession] = useState(null); // session requiring card auth

  const fetchSessions = () =>
    socialAPI
      .getSessions()
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleJoin = async (session) => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    // If the session has a fee, open card auth modal
    if (session.price_cents > 0) {
      setAuthSession(session);
      return;
    }
    try {
      await socialAPI.join(session.id);
      await fetchSessions();
    } catch (err) {
      alert(err.response?.data?.message ?? "Could not join session.");
    }
  };

  const handleLeave = async (id) => {
    if (!window.confirm("Are you sure you want to cancel your spot? Cancellations must be made at least 24 hours before the session.")) return;
    try {
      await socialAPI.leave(id);
      await fetchSessions();
    } catch (err) {
      alert(err.response?.data?.message ?? "Could not leave session.");
    }
  };

  const handleAuthSuccess = async () => {
    setAuthSession(null);
    await fetchSessions();
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
      {authSession && (
        <CardAuthModal
          session={authSession}
          onSuccess={handleAuthSuccess}
          onClose={() => setAuthSession(null)}
        />
      )}

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
                    onJoin={() => handleJoin(s)}
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
