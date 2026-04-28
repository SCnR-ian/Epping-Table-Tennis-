// ─── Payments Route ───────────────────────────────────────────────────────────
// POST /api/payments/create-intent  →  creates a Stripe PaymentIntent
// POST /api/payments/confirm        →  verifies payment then saves booking to DB
// GET  /api/payments/config         →  returns publishable key to frontend
// ─────────────────────────────────────────────────────────────────────────────

const router = require("express").Router();
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { randomUUID } = require("crypto");
const {
  checkOpenHours,
  maxConcurrentCourts,
} = require("../utils/scheduleCheck");

// Lazy-load Stripe so the server still boots without the package installed
// (will throw a clear error only when a payment endpoint is called)
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables.");
  }
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
// AUD cents per 30-minute slot
const PRICE_PER_30_MIN_CENTS = 500; // AUD $7.50 → 60 min = $15, 90 = $22.50, 120 = $30

function calcAmount(startTime, endTime) {
  const toMins = (t) => {
    const [h, m] = t.substring(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const slots = (toMins(endTime) - toMins(startTime)) / 30;
  return slots * PRICE_PER_30_MIN_CENTS; // amount in cents
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toMins(t) {
  const [h, m] = t.substring(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function minsToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`;
}

// ─── GET /api/payments/config ─────────────────────────────────────────────────
// Returns Stripe publishable key so frontend can initialise Stripe.js
router.get("/config", (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res
      .status(500)
      .json({ message: "Stripe is not configured on this server." });
  }
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// ─── POST /api/payments/create-intent ────────────────────────────────────────
// 1. Validates the requested slot is still available
// 2. Creates a Stripe PaymentIntent
// 3. Returns { clientSecret, amount, currency } to the frontend
// (No booking is saved to DB yet — that happens after payment succeeds)
router.post("/create-intent", requireAuth, async (req, res) => {
  const { date, start_time, end_time } = req.body;
  if (!date || !start_time || !end_time)
    return res
      .status(400)
      .json({ message: "date, start_time and end_time are required." });

  const startMins = toMins(start_time);
  const endMins = toMins(end_time);
  if (
    endMins <= startMins ||
    endMins - startMins < 60 ||
    (endMins - startMins) % 30 !== 0
  )
    return res
      .status(400)
      .json({
        message: "Duration must be at least 60 minutes and a multiple of 30.",
      });

  try {
    const stripe = getStripe();

    const clubId = req.club?.id ?? 1;

    const scheduleError = await checkOpenHours(
      date,
      start_time,
      end_time,
      clubId,
    );
    if (scheduleError) return res.status(409).json({ message: scheduleError });

    // Check courts still available (peak concurrent per 30-min slot)
    const { maxUsed: intentMax } = await maxConcurrentCourts(
      pool,
      date,
      start_time,
      end_time,
      clubId,
    );
    if (intentMax >= 6)
      return res
        .status(409)
        .json({ message: "Sorry, all courts are fully booked at that time." });

    const amount = calcAmount(start_time, end_time);
    const durationMins = endMins - startMins;

    // Create PaymentIntent — metadata stores booking details for the confirm step
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "aud",
      payment_method_types: ["card"],
      metadata: {
        user_id: String(req.user.id),
        club_id: String(clubId),
        date,
        start_time,
        end_time,
      },
      description: `Court booking – ${date} ${start_time.substring(0, 5)}–${end_time.substring(0, 5)} (${durationMins} min)`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount,
      currency: "aud",
      durationMins,
    });
  } catch (err) {
    console.error("[payments] create-intent error:", err.message);
    if (err.message.includes("STRIPE_SECRET_KEY"))
      return res
        .status(503)
        .json({
          message: "Payment system is not configured. Please contact the club.",
        });
    res
      .status(500)
      .json({ message: "Failed to create payment. Please try again." });
  }
});

// ─── POST /api/payments/confirm ───────────────────────────────────────────────
// Called by the frontend after stripe.confirmCardPayment() succeeds.
// 1. Retrieves the PaymentIntent from Stripe to verify status
// 2. Extracts booking details from metadata
// 3. Inserts booking rows into the DB (same logic as POST /api/bookings)
router.post("/confirm", requireAuth, async (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId)
    return res.status(400).json({ message: "paymentIntentId is required." });

  const client = await pool.connect();
  try {
    const stripe = getStripe();

    // Verify payment with Stripe (never trust frontend alone)
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded")
      return res
        .status(402)
        .json({
          message: `Payment not completed (status: ${paymentIntent.status}).`,
        });

    // Validate the user matches the intent metadata (security check)
    if (String(paymentIntent.metadata.user_id) !== String(req.user.id))
      return res
        .status(403)
        .json({ message: "Payment does not belong to this user." });

    const {
      date,
      start_time,
      end_time,
      club_id: metaClubId,
    } = paymentIntent.metadata;
    // Strict club validation: payment must have been created for the current club
    const metaClubIdNum = Number(metaClubId)
    const currentClubId = req.club?.id ?? 1
    if (!metaClubIdNum || metaClubIdNum !== currentClubId)
      return res.status(403).json({ message: 'Payment is not valid for this club.' })
    const clubId = metaClubIdNum
    const amountPaid = paymentIntent.amount / 100; // convert cents → dollars

    await client.query("BEGIN");

    // Check no one else took the last court while the user was paying (peak concurrent per slot)
    const { maxUsed: confirmMax } = await maxConcurrentCourts(
      client,
      date,
      start_time,
      end_time,
      clubId,
    );
    if (confirmMax >= 6) {
      await client.query("ROLLBACK");
      const refund = await stripe.refunds
        .create({ payment_intent: paymentIntentId, reason: "duplicate" })
        .catch(err => { console.error('[payments] REFUND FAILED for intent', paymentIntentId, err.message); return null; });
      if (!refund) console.error('[payments] ACTION REQUIRED: manual refund needed for intent', paymentIntentId);
      return res.status(409).json({
        message:
          "Sorry, all courts were just taken. Your payment will be fully refunded within 5–10 business days.",
      });
    }

    // Split into 30-min slots and insert
    const startMins = toMins(start_time);
    const endMins = toMins(end_time);
    const groupId = randomUUID();

    for (let t = startMins; t < endMins; t += 30) {
      await client.query(
        `INSERT INTO bookings
           (user_id, date, start_time, end_time, booking_group_id, payment_intent_id, amount_paid, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          req.user.id,
          date,
          minsToTime(t),
          minsToTime(t + 30),
          groupId,
          paymentIntentId,
          amountPaid / ((endMins - startMins) / 30),
          clubId,
        ],
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      message: "Booking confirmed.",
      booking_group_id: groupId,
      amount_paid: amountPaid,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[payments] confirm error:", err.message);
    if (err.code === "23505")
      return res
        .status(409)
        .json({
          message: "That slot was just taken. Please choose another time.",
        });
    res
      .status(500)
      .json({
        message: "Booking confirmation failed. Please contact the club.",
      });
  } finally {
    client.release();
  }
});

// ─── POST /api/payments/authorize ────────────────────────────────────────────
// Creates a PaymentIntent with capture_method:'manual' (card hold, no charge).
// type:'booking' → amount from time slots
// type:'social'  → amount from session.price_cents
router.post("/authorize", requireAuth, async (req, res) => {
  const { type, date, start_time, end_time, session_id } = req.body;
  if (!type) return res.status(400).json({ message: "type is required." });

  const clubId = req.club?.id ?? 1;
  try {
    const stripe = getStripe();
    let amount, description, metadata;

    if (type === "booking") {
      if (!date || !start_time || !end_time)
        return res
          .status(400)
          .json({
            message: "date, start_time and end_time required for booking.",
          });
      const startMins = toMins(start_time),
        endMins = toMins(end_time);
      if (endMins <= startMins || endMins - startMins < 60)
        return res.status(400).json({ message: "Invalid time range." });

      const scheduleError = await checkOpenHours(
        date,
        start_time,
        end_time,
        clubId,
      );
      if (scheduleError)
        return res.status(409).json({ message: scheduleError });

      const { maxUsed } = await maxConcurrentCourts(
        pool,
        date,
        start_time,
        end_time,
        clubId,
      );
      if (maxUsed >= 6)
        return res
          .status(409)
          .json({
            message: "Sorry, all courts are fully booked at that time.",
          });

      amount = calcAmount(start_time, end_time);
      const durationMins = endMins - startMins;
      description = `Court booking hold – ${date} ${start_time.substring(0, 5)}–${end_time.substring(0, 5)} (${durationMins} min)`;
      metadata = {
        type: "booking",
        user_id: String(req.user.id),
        club_id: String(clubId),
        date,
        start_time,
        end_time,
      };
    } else if (type === "social") {
      if (!session_id)
        return res
          .status(400)
          .json({ message: "session_id required for social." });
      const { rows } = await pool.query(
        "SELECT price_cents, title FROM social_play_sessions WHERE id=$1 AND club_id=$2",
        [session_id, clubId],
      );
      if (!rows.length)
        return res.status(404).json({ message: "Session not found." });
      amount = rows[0].price_cents;
      if (!amount || amount < 50)
        return res
          .status(400)
          .json({ message: "This session has no authorization fee." });
      description = `Social play hold – ${rows[0].title || "Social Play"} session ${session_id}`;
      metadata = {
        type: "social",
        user_id: String(req.user.id),
        club_id: String(clubId),
        session_id: String(session_id),
      };
    } else {
      return res
        .status(400)
        .json({ message: "type must be booking or social." });
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "aud",
      payment_method_types: ["card"],
      // booking: hold card (manual capture on no-show); social: charge immediately
      ...(type === "booking" ? { capture_method: "manual" } : {}),
      metadata,
      description,
    });

    res.json({
      clientSecret: intent.client_secret,
      amount,
      intentId: intent.id,
    });
  } catch (err) {
    console.error("[payments] authorize error:", err.message);
    res
      .status(500)
      .json({ message: "Failed to create authorization. Please try again." });
  }
});

// ─── POST /api/payments/confirm-authorize ─────────────────────────────────────
// After frontend confirms the card, saves the booking (status: authorized, not paid).
router.post("/confirm-authorize", requireAuth, async (req, res) => {
  const { intentId } = req.body;
  if (!intentId)
    return res.status(400).json({ message: "intentId is required." });

  const client = await pool.connect();
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(intentId);

    // booking = manual hold (requires_capture); social = immediate charge (succeeded)
    const expectedStatus = intent.metadata.type === "social" ? "succeeded" : "requires_capture"
    if (intent.status !== expectedStatus)
      return res
        .status(402)
        .json({
          message: `Payment not completed (status: ${intent.status}).`,
        });
    if (String(intent.metadata.user_id) !== String(req.user.id))
      return res
        .status(403)
        .json({ message: "Authorization does not belong to this user." });

    const {
      type,
      date,
      start_time,
      end_time,
      club_id: metaClub,
      session_id,
    } = intent.metadata;
    // Strict club validation
    const metaClubNum = Number(metaClub)
    const currentClubId = req.club?.id ?? 1
    if (!metaClubNum || metaClubNum !== currentClubId) {
      await client.query("ROLLBACK")
      await stripe.paymentIntents.cancel(intentId).catch(() => {})
      return res.status(403).json({ message: 'Authorization is not valid for this club.' })
    }
    const clubId = metaClubNum;

    await client.query("BEGIN");

    if (type === "booking") {
      const { maxUsed } = await maxConcurrentCourts(
        client,
        date,
        start_time,
        end_time,
        clubId,
      );
      if (maxUsed >= 6) {
        await client.query("ROLLBACK");
        await stripe.paymentIntents.cancel(intentId).catch(() => {});
        return res
          .status(409)
          .json({
            message:
              "Sorry, all courts were just taken. Your authorization has been cancelled.",
          });
      }

      const startMins = toMins(start_time),
        endMins = toMins(end_time);
      const groupId = randomUUID();
      const amountPerSlot = intent.amount / ((endMins - startMins) / 30) / 100;

      for (let t = startMins; t < endMins; t += 30) {
        await client.query(
          `INSERT INTO bookings
             (user_id, date, start_time, end_time, booking_group_id, payment_intent_id, amount_paid, club_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            req.user.id,
            date,
            minsToTime(t),
            minsToTime(t + 30),
            groupId,
            intentId,
            amountPerSlot,
            clubId,
          ],
        );
      }

      await client.query("COMMIT");

      // Notify admin (fire-and-forget)
      pool.query(`SELECT id FROM users WHERE role='admin' AND club_id=$1 LIMIT 1`, [clubId])
        .then(({ rows: [admin] }) => {
          if (!admin) return;
          const fmtTime = t => { const [h, m] = t.substring(0,5).split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
          const body = `🏓 ${req.user.name} booked a table on ${date} · ${fmtTime(start_time)}–${fmtTime(end_time)}`;
          pool.query(`INSERT INTO messages (sender_id, recipient_id, body, club_id) VALUES ($1,$2,$3,$4)`,
            [req.user.id, admin.id, body, clubId]).catch(() => {});
        }).catch(() => {});

      res
        .status(201)
        .json({ message: "Booking authorized.", booking_group_id: groupId });
    } else if (type === "social") {
      // Check not already joined
      const { rows: existing } = await client.query(
        "SELECT 1 FROM social_play_participants WHERE session_id=$1 AND user_id=$2",
        [session_id, req.user.id],
      );
      if (existing.length) {
        await client.query("ROLLBACK");
        await stripe.paymentIntents.cancel(intentId).catch(() => {});
        return res
          .status(409)
          .json({ message: "You have already joined this session." });
      }
      await client.query(
        "INSERT INTO social_play_participants (session_id, user_id, payment_intent_id) VALUES ($1,$2,$3)",
        [session_id, req.user.id, intentId],
      );
      await client.query("COMMIT");

      // Notify admin (fire-and-forget)
      Promise.all([
        pool.query(
          `SELECT id FROM users WHERE role='admin' AND club_id=$1 LIMIT 1`,
          [clubId],
        ),
        pool.query(`SELECT title, date FROM social_play_sessions WHERE id=$1`, [
          session_id,
        ]),
      ])
        .then(
          ([
            {
              rows: [admin],
            },
            {
              rows: [s],
            },
          ]) => {
            if (!admin || !s) return;
            pool
              .query(
                `INSERT INTO messages (sender_id, recipient_id, body, club_id) VALUES ($1,$2,$3,$4)`,
                [
                  req.user.id,
                  admin.id,
                  `📋 ${req.user.name} joined "${s.title || "Social Play"}" on ${s.date}`,
                  clubId,
                ],
              )
              .catch(() => {});
          },
        )
        .catch(() => {});

      res.status(201).json({ message: "Joined session. Card authorized." });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[payments] confirm-authorize error:", err.message);
    res.status(500).json({ message: "Failed to confirm authorization." });
  } finally {
    client.release();
  }
});

// ─── POST /api/payments/capture/:intentId ─────────────────────────────────────
// Admin only: capture (charge) an authorized PaymentIntent (no-show).
router.post("/capture/:intentId", requireAuth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admins only." });
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.capture(req.params.intentId);
    res.json({ status: intent.status, amount: intent.amount });
  } catch (err) {
    console.error("[payments] capture error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/payments/void/:intentId ───────────────────────────────────────
// Cancel an authorized PaymentIntent (user showed up — release the hold).
router.post("/void/:intentId", requireAuth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admins only." });
  try {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(req.params.intentId);
    res.json({ message: "Authorization released." });
  } catch (err) {
    console.error("[payments] void error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/payments/shop-intent ──────────────────────────────────────────
// Creates a Stripe PaymentIntent for a shopping cart order.
// Body: { items: [{ product_id, qty }] }
// Verifies prices from DB (never trust frontend amounts).
router.post("/shop-intent", requireAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "items array is required." });

  const clubId = req.club?.id ?? 1;
  try {
    const stripe = getStripe();

    // Fetch real prices from DB
    const ids = items.map((i) => i.product_id);
    const { rows: products } = await pool.query(
      `SELECT id, name, price FROM products WHERE id = ANY($1) AND club_id=$2 AND is_active=TRUE`,
      [ids, clubId],
    );

    // Build line items and calculate total
    let totalCents = 0;
    const lineItems = [];
    for (const item of items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product)
        return res
          .status(400)
          .json({ message: `Product ${item.product_id} not found.` });
      if (!product.price)
        return res
          .status(400)
          .json({ message: `Product "${product.name}" has no price set.` });
      const qty = Math.max(1, Math.floor(item.qty));
      const cents = Math.round(Number(product.price) * 100) * qty;
      totalCents += cents;
      lineItems.push({ name: product.name, qty, price: product.price });
    }

    if (totalCents < 50)
      return res.status(400).json({ message: "Order total is too small." });

    const description = lineItems.map((l) => `${l.name} ×${l.qty}`).join(", ");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "aud",
      payment_method_types: ["card"],
      metadata: {
        user_id: String(req.user.id),
        club_id: String(clubId),
        type: "shop_order",
      },
      description: `Shop order: ${description}`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
      currency: "aud",
    });
  } catch (err) {
    console.error("[payments] shop-intent error:", err.message);
    if (err.message.includes("STRIPE_SECRET_KEY"))
      return res
        .status(503)
        .json({ message: "Payment system is not configured." });
    res
      .status(500)
      .json({ message: "Failed to create payment. Please try again." });
  }
});

module.exports = router;
