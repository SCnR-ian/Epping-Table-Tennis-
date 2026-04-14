// ─── Payments Route ───────────────────────────────────────────────────────────
// POST /api/payments/create-intent  →  creates a Stripe PaymentIntent
// POST /api/payments/confirm        →  verifies payment then saves booking to DB
// GET  /api/payments/config         →  returns publishable key to frontend
// ─────────────────────────────────────────────────────────────────────────────

const router       = require('express').Router()
const pool         = require('../db')
const { requireAuth } = require('../middleware/auth')
const { randomUUID }  = require('crypto')
const { checkOpenHours } = require('../utils/scheduleCheck')

// Lazy-load Stripe so the server still boots without the package installed
// (will throw a clear error only when a payment endpoint is called)
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment variables.')
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY)
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
// AUD cents per 30-minute slot
const PRICE_PER_30_MIN_CENTS = 750   // AUD $7.50 → 60 min = $15, 90 = $22.50, 120 = $30

function calcAmount(startTime, endTime) {
  const toMins = t => { const [h, m] = t.substring(0, 5).split(':').map(Number); return h * 60 + m }
  const slots  = (toMins(endTime) - toMins(startTime)) / 30
  return slots * PRICE_PER_30_MIN_CENTS  // amount in cents
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}
function minsToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`
}

// ─── GET /api/payments/config ─────────────────────────────────────────────────
// Returns Stripe publishable key so frontend can initialise Stripe.js
router.get('/config', (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).json({ message: 'Stripe is not configured on this server.' })
  }
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY })
})

// ─── POST /api/payments/create-intent ────────────────────────────────────────
// 1. Validates the requested slot is still available
// 2. Creates a Stripe PaymentIntent
// 3. Returns { clientSecret, amount, currency } to the frontend
// (No booking is saved to DB yet — that happens after payment succeeds)
router.post('/create-intent', requireAuth, async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body
  if (!court_id || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'court_id, date, start_time and end_time are required.' })

  const startMins = toMins(start_time)
  const endMins   = toMins(end_time)
  if (endMins <= startMins || (endMins - startMins) < 60 || (endMins - startMins) % 30 !== 0)
    return res.status(400).json({ message: 'Duration must be at least 60 minutes and a multiple of 30.' })

  try {
    const stripe = getStripe()

    const clubId = req.club?.id ?? 1

    // Check slot is still free (read-only check — no lock needed here)
    const { rows: conflict } = await pool.query(
      `SELECT 1 FROM bookings
       WHERE court_id=$1 AND date=$2 AND status='confirmed' AND club_id=$5
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [court_id, date, start_time, end_time, clubId]
    )
    if (conflict.length)
      return res.status(409).json({ message: 'That slot is no longer available.' })

    const scheduleError = await checkOpenHours(date, start_time, end_time, clubId)
    if (scheduleError)
      return res.status(409).json({ message: scheduleError })

    const amount   = calcAmount(start_time, end_time)
    const durationMins = endMins - startMins

    // Create PaymentIntent — metadata stores booking details for the confirm step
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      metadata: {
        user_id:    String(req.user.id),
        club_id:    String(clubId),
        court_id:   String(court_id),
        date,
        start_time,
        end_time,
      },
      description: `Court ${court_id} – ${date} ${start_time.substring(0,5)}–${end_time.substring(0,5)} (${durationMins} min)`,
    })

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount,
      currency: 'aud',
      durationMins,
    })
  } catch (err) {
    console.error('[payments] create-intent error:', err.message)
    if (err.message.includes('STRIPE_SECRET_KEY'))
      return res.status(503).json({ message: 'Payment system is not configured. Please contact the club.' })
    res.status(500).json({ message: 'Failed to create payment. Please try again.' })
  }
})

// ─── POST /api/payments/confirm ───────────────────────────────────────────────
// Called by the frontend after stripe.confirmCardPayment() succeeds.
// 1. Retrieves the PaymentIntent from Stripe to verify status
// 2. Extracts booking details from metadata
// 3. Inserts booking rows into the DB (same logic as POST /api/bookings)
router.post('/confirm', requireAuth, async (req, res) => {
  const { paymentIntentId } = req.body
  if (!paymentIntentId)
    return res.status(400).json({ message: 'paymentIntentId is required.' })

  const client = await pool.connect()
  try {
    const stripe = getStripe()

    // Verify payment with Stripe (never trust frontend alone)
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded')
      return res.status(402).json({ message: `Payment not completed (status: ${paymentIntent.status}).` })

    // Validate the user matches the intent metadata (security check)
    if (String(paymentIntent.metadata.user_id) !== String(req.user.id))
      return res.status(403).json({ message: 'Payment does not belong to this user.' })

    const { court_id, date, start_time, end_time, club_id: metaClubId } = paymentIntent.metadata
    const clubId     = Number(metaClubId) || (req.club?.id ?? 1)
    const amountPaid = paymentIntent.amount / 100  // convert cents → dollars

    await client.query('BEGIN')

    // Check no one else booked while the user was paying
    const { rows: conflict } = await client.query(
      `SELECT 1 FROM bookings
       WHERE court_id=$1 AND date=$2 AND status='confirmed' AND club_id=$5
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [court_id, date, start_time, end_time, clubId]
    )
    if (conflict.length) {
      await client.query('ROLLBACK')
      // Refund the payment since we can't fulfil the booking
      await stripe.refunds.create({ payment_intent: paymentIntentId, reason: 'duplicate' }).catch(() => {})
      return res.status(409).json({
        message: 'Sorry, that slot was just taken. Your payment will be fully refunded within 5–10 business days.',
      })
    }

    // Split into 30-min slots and insert
    const startMins = toMins(start_time)
    const endMins   = toMins(end_time)
    const groupId   = randomUUID()

    for (let t = startMins; t < endMins; t += 30) {
      await client.query(
        `INSERT INTO bookings
           (user_id, court_id, date, start_time, end_time, booking_group_id, payment_intent_id, amount_paid, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.user.id, court_id, date, minsToTime(t), minsToTime(t + 30),
         groupId, paymentIntentId, amountPaid / ((endMins - startMins) / 30), clubId]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Booking confirmed.',
      booking_group_id: groupId,
      amount_paid: amountPaid,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[payments] confirm error:', err.message)
    if (err.code === '23505')
      return res.status(409).json({ message: 'That slot was just taken. Please choose another time.' })
    res.status(500).json({ message: 'Booking confirmation failed. Please contact the club.' })
  } finally {
    client.release()
  }
})

module.exports = router
