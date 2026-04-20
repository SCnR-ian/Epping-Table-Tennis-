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
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
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

// Returns true if the current user already has a booking overlapping this slot
function isUserBooked(slotTime, duration, userBookedSlots) {
  const slotStart = toMins(slotTime);
  const slotEnd   = slotStart + duration;
  return userBookedSlots.some(b => slotStart < b.endMins && slotEnd > b.startMins);
}

// Returns number of courts available for the given slot + duration.
// slotUsage is a map of { "HH:MM": courtsUsed } from the API.
function getAvailableCount(slotTime, duration, slotUsage) {
  const start = toMins(slotTime);
  const end   = start + duration;
  let minAvail = 6;
  for (let t = start; t < end; t += 30) {
    const key = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    minAvail = Math.min(minAvail, 6 - (slotUsage[key] ?? 0));
  }
  return Math.max(0, minAvail);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingPage({ embedded = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [step,         setStep]         = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration,     setDuration]     = useState(60);
  const [slotUsage,        setSlotUsage]        = useState({});
  const [userBookedSlots, setUserBookedSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);

  // ── Payment state ─────────────────────────────────────────────────────────
  const [clientSecret,   setClientSecret]   = useState(null);
  const [amountCents,    setAmountCents]     = useState(0);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [cardElement,    setCardElement]    = useState(null);
  const [paymentError,   setPaymentError]   = useState(null);
  const [payingNow,      setPayingNow]      = useState(false);
  const [intentLoading,  setIntentLoading]  = useState(false);
  const cardRef = useRef(null);

  // Split open dates into this week / next week
  const openDates = getOpenDates();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() + 7);
  const thisWeekDates = openDates.filter(d => d < cutoff);
  const nextWeekDates = openDates.filter(d => d >= cutoff);

  // Fetch bookings for the selected date
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

  const selectedDow = selectedDate ? new Date(selectedDate + "T12:00:00").getDay() : null;
  const timeSlots   = selectedDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;

  // Available court count for the currently selected slot
  const availableCount = selectedTime ? getAvailableCount(selectedTime, duration, slotUsage) : 6;

  // ── Move to payment step: create PaymentIntent ───────────────────────────
  const handleProceedToPayment = async () => {
    if (getAvailableCount(selectedTime, duration, slotUsage) === 0) {
      alert("Sorry, this slot is no longer available. Please choose another time.");
      setStep(1);
      return;
    }
    setIntentLoading(true);
    setPaymentError(null);
    try {
      const { data } = await paymentsAPI.createIntent({
        date:       selectedDate,
        start_time: selectedTime,
        end_time:   addMins(selectedTime, duration),
      });
      setClientSecret(data.clientSecret);
      setAmountCents(data.amount);
      setStep(3);
    } catch (err) {
      alert(err.response?.data?.message || "Could not start payment. Please try again.");
    } finally {
      setIntentLoading(false);
    }
  };

  // ── Mount Stripe card element when Step 3 renders ────────────────────────
  useEffect(() => {
    if (step !== 3 || !clientSecret || cardElement) return;
    const stripe = window.Stripe?.(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
    if (!stripe) { setPaymentError("Payment system failed to load. Please refresh the page."); return; }
    setStripeInstance(stripe);
    const elements = stripe.elements();
    const card = elements.create("card", {
      style: {
        base: {
          color: "#f1f5f9",
          fontFamily: "DM Sans, sans-serif",
          fontSize: "16px",
          "::placeholder": { color: "#64748b" },
        },
        invalid: { color: "#f87171" },
      },
    });
    // Mount after the DOM node is available
    setTimeout(() => {
      if (cardRef.current) {
        card.mount(cardRef.current);
        setCardElement(card);
      }
    }, 50);
    return () => { card.destroy(); setCardElement(null); };
  }, [step, clientSecret]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Process payment ───────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!stripeInstance || !cardElement || !clientSecret) return;
    setPayingNow(true);
    setPaymentError(null);
    try {
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (error) {
        setPaymentError(error.message);
        setPayingNow(false);
        return;
      }
      if (paymentIntent.status === "succeeded") {
        // Tell backend to create the booking
        await paymentsAPI.confirm(paymentIntent.id);
        setConfirmed(true);
      }
    } catch (err) {
      setPaymentError(err.response?.data?.message || "Payment failed. Please try again.");
    } finally {
      setPayingNow(false);
    }
  };

  const reset = () => {
    setStep(1); setSelectedDate(""); setSelectedTime(""); setDuration(60);
    setBookedSlots([]); setUserBookedSlots([]); setConfirmed(false);
    setClientSecret(null); setAmountCents(0); setStripeInstance(null);
    setCardElement(null); setPaymentError(null);
  };

  // ── Confirmed screen ──────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className={`${embedded ? "flex items-center justify-center px-4 py-10" : "page-wrapper flex items-center justify-center px-4"}`}>
        <div className="card max-w-md w-full text-center space-y-4 animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-3xl text-white tracking-wider">Booked!</h2>
          <p className="text-slate-400 text-sm">
            Your slot on <strong className="text-white">{selectedDate}</strong> at{" "}
            <strong className="text-white">{fmtTime(selectedTime)}</strong> for{" "}
            <strong className="text-white">{duration} min</strong> is confirmed.
          </p>
          <p className="text-slate-500 text-xs">
            A table will be assigned for you on arrival.
          </p>
          <button onClick={() => navigate("/dashboard")} className="btn-primary w-full">
            View My Bookings
          </button>
          <button onClick={reset} className="btn-outline w-full">
            Book Another
          </button>
        </div>
      </div>
    );
  }

  // ── Step indicator ────────────────────────────────────────────────────────
  const STEPS = ["Date & Time", "Review", "Payment"];

  return (
    <div className={`${embedded ? "" : "page-wrapper"} py-10 px-4 max-w-2xl mx-auto`}>
      <h1 className="font-display text-5xl text-white tracking-wider mb-2 text-center">Book a Slot</h1>
      <p className="text-slate-500 mb-8 text-center">Choose a date and time — we'll handle the rest.</p>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-10">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-normal transition-colors ${
              step > i + 1
                ? "bg-brand-500 text-white"
                : step === i + 1
                  ? "bg-brand-500/20 text-brand-400 border border-brand-500"
                  : "bg-court-light text-slate-500"
            }`}>
              {step > i + 1 ? "✓" : i + 1}
            </div>
            <span className={`text-sm hidden sm:block ${step === i + 1 ? "text-white font-medium" : "text-slate-500"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-court-light" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Date & Time ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">

          {/* Date picker */}
          <div className="card">
            <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-4 text-center">Select a Date</h2>

            {thisWeekDates.length > 0 && (
              <div className="mb-5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-normal mb-2 text-center">This Week</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {thisWeekDates.map(d => {
                    const iso    = toISO(d);
                    const active = selectedDate === iso;
                    return (
                      <button
                        key={iso}
                        onClick={() => { setSelectedDate(iso); setSelectedTime(""); }}
                        className={`min-w-[72px] px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-center ${
                          active
                            ? "bg-brand-500 border-brand-500 text-white"
                            : "border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white"
                        }`}
                      >
                        <div className="font-normal">{d.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                        <div className="opacity-80">{d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {nextWeekDates.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-normal mb-2 text-center">Next Week</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {nextWeekDates.map(d => {
                    const iso    = toISO(d);
                    const active = selectedDate === iso;
                    return (
                      <button
                        key={iso}
                        onClick={() => { setSelectedDate(iso); setSelectedTime(""); }}
                        className={`min-w-[72px] px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-center ${
                          active
                            ? "bg-brand-500 border-brand-500 text-white"
                            : "border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white"
                        }`}
                      >
                        <div className="font-normal">{d.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                        <div className="opacity-80">{d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Duration + Time (after date is picked) */}
          {selectedDate && (
            <div className="card space-y-5">

              {/* Duration */}
              <div>
                <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-3 text-center">Duration</h2>
                <div className="flex gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => { setDuration(d); setSelectedTime(""); }}
                      className={`py-2 px-4 rounded-lg text-sm font-medium border transition-all flex-1 ${
                        duration === d
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white"
                      }`}
                    >
                      {d}min
                    </button>
                  ))}
                </div>
              </div>

              {/* Time slots */}
              <div>
                <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-3 text-center">Start Time</h2>
                {slotsLoading ? (
                  <p className="text-slate-500 text-sm">Loading availability…</p>
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
                          className={`py-3 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                            disabled
                              ? "border-court-light text-slate-600 opacity-40 cursor-not-allowed"
                              : active
                                ? "bg-brand-500 border-brand-500 text-white"
                                : "border-court-light text-slate-400 hover:border-brand-500/50 hover:text-white"
                          }`}
                        >
                          <span className="font-normal text-xs">{fmtTime(t)}</span>
                          <span className={`text-[10px] ${active ? "text-white/70" : disabled ? "" : "text-emerald-500"}`}>
                            {mine ? "Yours" : full ? "Full" : "Available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Availability banner + continue */}
          {selectedTime && (
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
              availableCount > 0
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-red-500/5 border-red-500/20"
            }`}>
              <div className={`font-display text-4xl font-normal ${availableCount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {availableCount}
              </div>
              <div>
                <p className="text-white font-medium text-sm">
                  {availableCount === 1 ? "table available" : availableCount > 1 ? `of 6 tables available` : "No tables available"}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {selectedDate} · {fmtTime(selectedTime)} · {duration} min
                </p>
              </div>
              {availableCount > 0 && (
                <button onClick={() => setStep(2)} className="btn-primary ml-auto shrink-0">
                  Continue →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Confirm ──────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="card max-w-lg mx-auto space-y-6 animate-fade-in">
          <h2 className="font-normal text-white">Confirm Your Booking</h2>

          <div className="space-y-0 text-sm">
            {[
              ["Date",             selectedDate],
              ["Time",             fmtTime(selectedTime)],
              ["Duration",         `${duration} minutes`],
              ["Tables available", `${availableCount} of 6`],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between py-3 border-b border-court-light last:border-0">
                <span className="text-slate-500">{label}</span>
                <span className={`font-medium ${label === "Tables available" ? "text-emerald-400" : "text-white"}`}>{val}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600">
            A table will be assigned for you on arrival.
          </p>

          {!isAuthenticated ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400 text-center">
                You need to be signed in to complete your booking.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
                <button
                  onClick={() => navigate("/login", { state: { from: { pathname: "/booking" } } })}
                  className="btn-primary flex-1"
                >
                  Sign In to Book
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
              <button
                onClick={handleProceedToPayment}
                disabled={intentLoading}
                className="btn-primary flex-1"
              >
                {intentLoading ? "Loading…" : "Proceed to Payment →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Payment ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="card max-w-lg mx-auto space-y-6 animate-fade-in">
          <h2 className="font-normal text-white">Payment</h2>

          {/* Booking summary */}
          <div className="bg-court-light/50 rounded-lg px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Date</span>
              <span className="text-white">{selectedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Time</span>
              <span className="text-white">{fmtTime(selectedTime)} · {duration} min</span>
            </div>
            <div className="flex justify-between border-t border-court-light pt-2 mt-2">
              <span className="text-slate-300 font-medium">Total</span>
              <span className="text-white font-semibold text-base">
                AUD ${(amountCents / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Stripe card element */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
              Card Details
            </label>
            <div
              ref={cardRef}
              className="bg-court-dark border border-court-light rounded-lg px-4 py-3.5 min-h-[46px]"
            />
            {paymentError && (
              <p className="text-red-400 text-xs mt-2">{paymentError}</p>
            )}
          </div>

          <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
            <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Secured by Stripe. Your card details are never stored on our servers.
          </p>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1" disabled={payingNow}>
              ← Back
            </button>
            <button
              onClick={handlePay}
              disabled={payingNow || !cardElement}
              className="btn-primary flex-1"
            >
              {payingNow
                ? "Processing…"
                : `Pay AUD $${(amountCents / 100).toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
