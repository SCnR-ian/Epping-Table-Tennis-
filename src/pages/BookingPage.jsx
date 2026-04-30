import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { bookingsAPI, paymentsAPI } from "@/api/api";
import { useAuth } from "@/context/AuthContext";

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEKDAY_SLOTS  = ["15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
const SATURDAY_SLOTS = ["12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const DURATIONS      = [60, 90, 120];
const OPEN_DOW       = new Set([1, 2, 3, 6]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOpenDates() {
  const dates = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    if (OPEN_DOW.has(d.getDay())) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function toMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function addMins(t, mins) {
  const total = toMins(t) + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function isUserBooked(slotTime, duration, userBookedSlots) {
  const slotStart = toMins(slotTime);
  const slotEnd   = slotStart + duration;
  return userBookedSlots.some(b => slotStart < b.endMins && slotEnd > b.startMins);
}

function getAvailableCount(slotTime, duration, slotUsage) {
  const start = toMins(slotTime);
  const end   = start + duration;
  let minAvail = 6;
  for (let t = start; t < end; t += 30) {
    const key = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    minAvail = Math.min(minAvail, 6 - (slotUsage[key] ?? 0));
  }
  return Math.max(0, minAvail);
}

// ─── Mini Calendar ───────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_LABELS  = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function CalendarPicker({ selectedDate, onSelect }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay  = new Date(viewYear, viewMonth, 1);
  const lastDay   = new Date(viewYear, viewMonth + 1, 0);
  const startDow  = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) cells.push(i);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const prevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-4 max-w-xs mx-auto">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          disabled={isCurrentMonth}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black disabled:opacity-20 transition-colors text-lg leading-none"
        >
          ‹
        </button>
        <span className="text-xs tracking-widest uppercase text-black">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black transition-colors text-lg leading-none"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] tracking-widest uppercase text-gray-300 py-1">{l}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`p${idx}`} />;
          const date     = new Date(viewYear, viewMonth, day);
          const dow      = date.getDay();
          const isPast   = date < today;
          const isOpen   = OPEN_DOW.has(dow);
          const disabled = isPast || !isOpen;
          const iso      = toISO(date);
          const active   = selectedDate === iso;
          return (
            <button
              key={day}
              onClick={() => { if (!disabled) onSelect(iso); }}
              disabled={disabled}
              className={`w-full aspect-square flex items-center justify-center text-xs rounded-lg transition-all ${
                disabled
                  ? "text-gray-200 cursor-not-allowed"
                  : active
                    ? "bg-black text-white"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Payment Sheet ────────────────────────────────────────────────────────────

function PaymentSheet({ selectedDate, selectedTime, duration, onSuccess, onClose }) {
  const [paymentMode,    setPaymentMode]    = useState(null);   // null = picking, 'hold' | 'immediate'
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
    paymentsAPI.authorize({
      type: "booking",
      date: selectedDate,
      start_time: selectedTime,
      end_time: addMins(selectedTime, duration),
      payment_mode: paymentMode,
    })
      .then(({ data }) => { setClientSecret(data.clientSecret); setAmountCents(data.amount); })
      .catch(err => setPaymentError(err.response?.data?.message || "Could not start payment."))
      .finally(() => setLoading(false));
  }, [paymentMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clientSecret || cardElement) return;
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey) { setPaymentError("Stripe is not configured."); return; }
    const stripe = window.Stripe?.(stripeKey);
    if (!stripe)  { setPaymentError("Payment system failed to load."); return; }
    setStripeInstance(stripe);
    const elements = stripe.elements();
    const card = elements.create("card", {
      style: {
        base:    { color: "#111827", fontFamily: "DM Sans, sans-serif", fontSize: "16px", "::placeholder": { color: "#9ca3af" } },
        invalid: { color: "#ef4444" },
      },
    });
    setTimeout(() => {
      if (cardRef.current) { card.mount(cardRef.current); setCardElement(card); }
    }, 50);
    return () => { card.destroy(); setCardElement(null); };
  }, [clientSecret]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!stripeInstance || !cardElement || !clientSecret) return;
    setProcessing(true);
    setPaymentError(null);
    try {
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (error) { setPaymentError(error.message); return; }
      if (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded") {
        await paymentsAPI.confirmAuthorize(paymentIntent.id);
        onSuccess();
      } else {
        setPaymentError("Unexpected status. Please try again.");
      }
    } catch (err) {
      setPaymentError(err.response?.data?.message || "Authorization failed.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-black text-base font-normal">Confirm Booking</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {selectedDate} · {fmtTime(selectedTime)} · {duration} min
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors text-xl leading-none">×</button>
        </div>

        {/* Step 1: pick payment mode */}
        {!paymentMode && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest">How would you like to pay?</p>
            <button
              onClick={() => setPaymentMode('hold')}
              className="w-full text-left border border-gray-200 rounded-xl px-4 py-3.5 hover:border-black transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Pay in person (cash)</p>
              <p className="text-xs text-gray-400 mt-0.5">Card held as guarantee · only charged if you don't show up</p>
            </button>
            <button
              onClick={() => setPaymentMode('immediate')}
              className="w-full text-left border border-gray-200 rounded-xl px-4 py-3.5 hover:border-black transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Pay now (card)</p>
              <p className="text-xs text-gray-400 mt-0.5">Card charged immediately · full refund if you cancel</p>
            </button>
            <button onClick={onClose} className="w-full border border-gray-200 text-gray-500 text-xs tracking-widest uppercase py-3 rounded-full hover:border-black transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* Step 2: card details */}
        {paymentMode && (
          <>
            <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${paymentMode === 'hold' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
              {paymentMode === 'hold'
                ? <>Card held as guarantee only. <strong>Pay cash on the day.</strong> Card charged only if you don't show up.</>
                : <>Your card will be <strong>charged immediately</strong>. Full refund if you cancel in time.</>
              }
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
            ) : paymentError && !clientSecret ? (
              <p className="text-red-500 text-sm text-center">{paymentError}</p>
            ) : (
              <>
                <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-4">
                  <span className="text-gray-500">{paymentMode === 'hold' ? 'Hold amount' : 'Amount'}</span>
                  <span className="text-black font-medium">AUD ${(amountCents / 100).toFixed(2)}</span>
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
                  <button
                    onClick={() => { setPaymentMode(null); setClientSecret(null); setCardElement(null); }}
                    className="flex-1 border border-gray-300 text-gray-700 text-xs tracking-widest uppercase py-3 rounded-full hover:border-black hover:text-black transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={processing || !cardElement}
                    className="flex-1 bg-black text-white text-xs tracking-widest uppercase py-3 rounded-full hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {processing ? "Processing…" : paymentMode === 'hold' ? "Hold & Book" : "Pay & Book"}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingPage({ embedded = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [selectedDate,    setSelectedDate]   = useState("");
  const [selectedTime,    setSelectedTime]   = useState("");
  const [duration,        setDuration]       = useState(60);
  const [slotUsage,       setSlotUsage]      = useState({});
  const [userBookedSlots, setUserBookedSlots] = useState([]);
  const [slotsLoading,    setSlotsLoading]   = useState(false);
  const [showPayment,     setShowPayment]    = useState(false);
  const [confirmed,       setConfirmed]      = useState(false);
  const [showCalendar,    setShowCalendar]   = useState(false);

  const openDates = getOpenDates();

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setSlotsLoading(true);
    bookingsAPI.getAvailable(selectedDate)
      .then(({ data }) => {
        if (cancelled) return;
        setSlotUsage(data.slot_usage ?? {});
        setUserBookedSlots(
          (data.user_booked || []).map(b => ({
            startMins: toMins(b.start_time.substring(0, 5)),
            endMins:   toMins(b.end_time.substring(0, 5)),
          }))
        );
      })
      .catch(() => { if (!cancelled) setSlotUsage({}); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const selectedDow    = selectedDate ? new Date(selectedDate + "T12:00:00").getDay() : null;
  const timeSlots      = selectedDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;
  const availableCount = selectedTime ? getAvailableCount(selectedTime, duration, slotUsage) : 6;
  const canBook        = !!(selectedDate && selectedTime && availableCount > 0);

  const handleBook = () => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: "/play" } } });
      return;
    }
    setShowPayment(true);
  };

  const reset = () => {
    setSelectedDate(""); setSelectedTime(""); setDuration(60);
    setUserBookedSlots([]); setConfirmed(false); setShowPayment(false);
  };

  // ── Confirmed ────────────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <div className="w-14 h-14 rounded-full border border-black flex items-center justify-center mx-auto mb-6">
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-normal text-black mb-3">Booking Confirmed</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-2">
          {selectedDate} &nbsp;·&nbsp; {fmtTime(selectedTime)} &nbsp;·&nbsp; {duration} min
        </p>
        <p className="text-gray-400 text-xs mb-8">
          A table will be assigned on arrival. Your card hold is released when you check in.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full bg-black text-white text-xs tracking-widest uppercase py-4 rounded-full hover:bg-gray-800 transition-colors"
          >
            View My Bookings
          </button>
          <button
            onClick={reset}
            className="w-full border border-gray-300 text-gray-700 text-xs tracking-widest uppercase py-4 rounded-full hover:border-black hover:text-black transition-colors"
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {showPayment && (
        <PaymentSheet
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          duration={duration}
          onSuccess={() => { setShowPayment(false); setConfirmed(true); }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* ── Duration ─────────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <p className="text-xs tracking-widest uppercase text-gray-400 mb-4 text-center">Duration</p>
        <div className="flex gap-2 justify-center">
          {DURATIONS.map(d => (
            <button
              key={d}
              onClick={() => { setDuration(d); setSelectedTime(""); }}
              className={`px-7 py-2.5 rounded-full text-xs tracking-widest uppercase border transition-all ${
                duration === d
                  ? "bg-black border-black text-white"
                  : "border-gray-300 text-gray-600 hover:border-black hover:text-black"
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* ── Date row ─────────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <p className="text-xs tracking-widest uppercase text-gray-400">Date</p>
          <button
            onClick={() => setShowCalendar(v => !v)}
            className={`text-[10px] tracking-widest uppercase border rounded-full px-3 py-1 transition-colors ${
              showCalendar
                ? "border-black text-black"
                : "border-gray-200 text-gray-400 hover:border-black hover:text-black"
            }`}
          >
            {showCalendar ? "Hide Calendar" : "More Dates"}
          </button>
        </div>

        {/* Quick-pick chips (next 14 days) */}
        {!showCalendar && (
          <div className="flex gap-2 flex-wrap justify-center">
            {openDates.map(d => {
              const iso    = toISO(d);
              const active = selectedDate === iso;
              return (
                <button
                  key={iso}
                  onClick={() => { setSelectedDate(iso); setSelectedTime(""); }}
                  className={`shrink-0 min-w-[64px] px-3 py-3 rounded-xl text-xs border transition-all text-center ${
                    active
                      ? "bg-black border-black text-white"
                      : "border-gray-200 text-gray-700 hover:border-black hover:text-black"
                  }`}
                >
                  <div>{d.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                  <div className="opacity-70 mt-0.5">{d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Full calendar */}
        {showCalendar && (
          <CalendarPicker
            selectedDate={selectedDate}
            onSelect={iso => { setSelectedDate(iso); setSelectedTime(""); }}
          />
        )}
      </div>

      {/* ── Time slots ───────────────────────────────────────────────────────── */}
      {selectedDate && (
        <div className="mb-10">
          <p className="text-xs tracking-widest uppercase text-gray-400 mb-4 text-center">Start Time</p>
          {slotsLoading ? (
            <p className="text-gray-400 text-sm text-center py-6">Loading availability…</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {timeSlots.map(t => {
                const free     = getAvailableCount(t, duration, slotUsage);
                const full     = free === 0;
                const mine     = isUserBooked(t, duration, userBookedSlots);
                const disabled = full || mine;
                const active   = selectedTime === t;
                return (
                  <button
                    key={t}
                    onClick={() => { if (!disabled) setSelectedTime(t); }}
                    disabled={disabled}
                    className={`py-3 rounded-xl border transition-all flex flex-col items-center gap-0.5 ${
                      disabled
                        ? "border-gray-100 text-gray-300 cursor-not-allowed"
                        : active
                          ? "bg-black border-black text-white"
                          : "border-gray-200 text-gray-700 hover:border-black hover:text-black"
                    }`}
                  >
                    <span className="text-xs">{fmtTime(t)}</span>
                    <span className={`text-[10px] ${
                      active ? "text-white/60" : disabled ? "text-gray-300" : "text-emerald-500"
                    }`}>
                      {mine ? "Yours" : full ? "Full" : `${free} free`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Book Button ──────────────────────────────────────────────────────── */}
      {canBook && (
        <div className="mt-2">
          <button
            onClick={handleBook}
            className="w-full bg-black text-white text-xs tracking-widest uppercase py-4 rounded-full hover:bg-gray-800 transition-colors"
          >
            Book &nbsp;·&nbsp; {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} &nbsp;·&nbsp; {fmtTime(selectedTime)} &nbsp;·&nbsp; {duration} min
          </button>
        </div>
      )}
    </div>
  );
}
