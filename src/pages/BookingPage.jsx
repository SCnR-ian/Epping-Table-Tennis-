import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bookingsAPI } from "@/api/api";
import { useAuth } from "@/context/AuthContext";

// ─── Constants ───────────────────────────────────────────────────────────────

const COURTS = [
  { id: 1 }, { id: 2 }, { id: 3 },
  { id: 4 }, { id: 5 }, { id: 6 },
];

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

// Returns courts that are free for the given slot + duration
function getFreeCourts(slotTime, duration, bookedSlots) {
  const slotStart = toMins(slotTime);
  const slotEnd   = slotStart + duration;
  return COURTS.filter(c =>
    !bookedSlots.some(b => {
      if (b.courtId !== c.id) return false;
      const bStart = toMins(b.startTime);
      const bEnd   = bStart + b.duration;
      return slotStart < bEnd && slotEnd > bStart;
    })
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingPage({ embedded = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [step,         setStep]         = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration,     setDuration]     = useState(60);
  const [bookedSlots,     setBookedSlots]     = useState([]);
  const [userBookedSlots, setUserBookedSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);

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
        setBookedSlots(
          data.booked.map(b => ({
            courtId:   b.court_id,
            startTime: b.start_time.substring(0, 5),
            duration:  toMins(b.end_time.substring(0, 5)) - toMins(b.start_time.substring(0, 5)),
          }))
        );
        setUserBookedSlots(
          (data.user_booked || []).map(b => ({
            startMins: toMins(b.start_time.substring(0, 5)),
            endMins:   toMins(b.end_time.substring(0, 5)),
          }))
        );
      })
      .catch(() => { if (!cancelled) setBookedSlots([]); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const selectedDow = selectedDate ? new Date(selectedDate + "T12:00:00").getDay() : null;
  const timeSlots   = selectedDow === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;

  // Free courts for the currently selected slot
  const freeCourts     = selectedTime ? getFreeCourts(selectedTime, duration, bookedSlots) : COURTS;
  const availableCount = freeCourts.length;

  const handleSubmit = async () => {
    const free = getFreeCourts(selectedTime, duration, bookedSlots);
    if (free.length === 0) {
      alert("Sorry, this slot is no longer available. Please choose another time.");
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      await bookingsAPI.create({
        court_id:   free[0].id,
        date:       selectedDate,
        start_time: selectedTime,
        end_time:   addMins(selectedTime, duration),
      });
      setConfirmed(true);
    } catch (err) {
      alert(err.response?.data?.message || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setSelectedDate(""); setSelectedTime(""); setDuration(60);
    setBookedSlots([]); setUserBookedSlots([]); setConfirmed(false);
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
  const STEPS = ["Date & Time", "Confirm"];

  return (
    <div className={`${embedded ? "" : "page-wrapper"} py-10 px-4 max-w-2xl mx-auto`}>
      <h1 className="font-display text-5xl text-white tracking-wider mb-2">Book a Slot</h1>
      <p className="text-slate-500 mb-8">Choose a date and time — we'll handle the rest.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
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
            <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-4">Select a Date</h2>

            {thisWeekDates.length > 0 && (
              <div className="mb-5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-normal mb-2">This Week</p>
                <div className="flex gap-2 flex-wrap">
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
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-normal mb-2">Next Week</p>
                <div className="flex gap-2 flex-wrap">
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
                <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-3">Duration</h2>
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
                <h2 className="text-sm font-normal text-slate-300 uppercase tracking-wider mb-3">Start Time</h2>
                {slotsLoading ? (
                  <p className="text-slate-500 text-sm">Loading availability…</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {timeSlots.map(t => {
                      const free     = getFreeCourts(t, duration, bookedSlots).length;
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
        <div className="card max-w-lg space-y-6 animate-fade-in">
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
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">
                {submitting ? "Confirming…" : "Confirm Booking"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
