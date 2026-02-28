const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')
const { randomUUID } = require('crypto')
const jwt    = require('jsonwebtoken')

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Reads JWT if present but never rejects — used for optional auth
function softAuth(req) {
  try {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer '))
      req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET)
  } catch { /* no token or invalid — proceed as guest */ }
}

function toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function minsToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/bookings/available?date=YYYY-MM-DD
// Returns all confirmed 30-min slots for a date.
// If a valid JWT is present, also returns the user's own booked windows
// as `user_booked` so the UI can disable already-booked time slots.
router.get('/available', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ message: 'date query param required.' })
  softAuth(req)
  try {
    const { rows: bookedRows } = await pool.query(
      `SELECT court_id, start_time, end_time FROM bookings
       WHERE date=$1 AND status='confirmed'`,
      [date]
    )
    // Expand coaching sessions into 30-min slots so coached courts appear occupied
    const { rows: coachingRows } = await pool.query(
      `SELECT
         cs.court_id,
         slot_start                            AS start_time,
         (slot_start + INTERVAL '30 minutes')  AS end_time
       FROM coaching_sessions cs,
       LATERAL generate_series(
         cs.start_time::time,
         cs.end_time::time - INTERVAL '30 minutes',
         INTERVAL '30 minutes'
       ) AS slot_start
       WHERE cs.date=$1 AND cs.status='confirmed'`,
      [date]
    )
    const booked = [...bookedRows, ...coachingRows]
    let userBooked = []
    if (req.user) {
      const { rows: ur } = await pool.query(
        `SELECT start_time, end_time FROM bookings
         WHERE date=$1 AND user_id=$2 AND status='confirmed'`,
        [date, req.user.id]
      )
      userBooked = ur
    }
    res.json({ booked, user_booked: userBooked })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/bookings/my
// Returns the user's booking sessions, grouped by booking_group_id.
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         b.booking_group_id,
         MIN(b.id)         AS id,
         b.court_id,
         c.name            AS court_name,
         b.date,
         MIN(b.start_time) AS start_time,
         MAX(b.end_time)   AS end_time,
         CASE
           WHEN bool_and(b.status = 'cancelled') THEN 'cancelled'
           WHEN bool_or(b.status  = 'cancelled') THEN 'partial'
           ELSE 'confirmed'
         END               AS status,
         MIN(b.created_at) AS created_at
       FROM bookings b
       JOIN courts c ON c.id = b.court_id
       WHERE b.user_id = $1
         AND b.date >= CURRENT_DATE
       GROUP BY b.booking_group_id, b.court_id, b.date, c.name
       ORDER BY b.date ASC, MIN(b.start_time) ASC`,
      [req.user.id]
    )
    res.json({ bookings: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/bookings/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, c.name AS court_name FROM bookings b
       JOIN courts c ON c.id=b.court_id WHERE b.id=$1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' })
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden.' })
    res.json({ booking: rows[0] })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/bookings
// Accepts start_time + end_time; splits into 30-min slots and inserts each.
router.post('/', requireAuth, async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body
  if (!court_id || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'court_id, date, start_time and end_time are required.' })

  const startMins = toMins(start_time)
  const endMins   = toMins(end_time)

  if (endMins <= startMins || (endMins - startMins) % 30 !== 0)
    return res.status(400).json({ message: 'Duration must be a positive multiple of 30 minutes.' })

  const slots = []
  for (let t = startMins; t < endMins; t += 30)
    slots.push([minsToTime(t), minsToTime(t + 30)])

  const groupId = randomUUID()
  const client  = await pool.connect()

  try {
    await client.query('BEGIN')
    for (const [s, e] of slots) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.user.id, court_id, date, s, e, groupId]
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ message: 'Booking confirmed.', booking_group_id: groupId })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      if (err.constraint === 'user_no_double_book')
        return res.status(409).json({ message: 'You already have a booking during that time.' })
      return res.status(409).json({ message: 'One or more of those slots are already booked.' })
    }
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// POST /api/bookings/group/:groupId/extend
// Appends extra 30-min slots to an existing session on the same court.
router.post('/group/:groupId/extend', requireAuth, async (req, res) => {
  const extra = Number(req.body.extra_minutes)
  if (!extra || extra % 30 !== 0 || extra <= 0)
    return res.status(400).json({ message: 'extra_minutes must be a positive multiple of 30.' })

  try {
    const { rows } = await pool.query(
      `SELECT court_id, date, MAX(end_time) AS end_time, MIN(user_id) AS user_id
       FROM bookings WHERE booking_group_id=$1 GROUP BY court_id, date`,
      [req.params.groupId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' })
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden.' })

    const { court_id, date, end_time } = rows[0]
    const startMins = toMins(end_time)
    const slots = []
    for (let t = startMins; t < startMins + extra; t += 30)
      slots.push([minsToTime(t), minsToTime(t + 30)])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const [s, e] of slots) {
        await client.query(
          `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.user.id, court_id, date, s, e, req.params.groupId]
        )
      }
      await client.query('COMMIT')
      res.json({ message: 'Booking extended.' })
    } catch (err) {
      await client.query('ROLLBACK')
      if (err.code === '23505') {
        if (err.constraint === 'user_no_double_book')
          return res.status(409).json({ message: 'You already have a booking during that time.' })
        return res.status(409).json({ message: 'That time is already booked by someone else.' })
      }
      res.status(500).json({ message: 'Server error.' })
    } finally {
      client.release()
    }
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/bookings/group/:groupId  (cancel all slots in a session)
router.delete('/group/:groupId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM bookings WHERE booking_group_id=$1 LIMIT 1',
      [req.params.groupId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' })
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden.' })

    await pool.query(
      'DELETE FROM bookings WHERE booking_group_id=$1',
      [req.params.groupId]
    )
    res.json({ message: 'Booking cancelled.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/bookings/:id  (delete a single 30-min slot — used by admin)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id=$1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' })
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden.' })

    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id])
    res.json({ message: 'Slot deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
