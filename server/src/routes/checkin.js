const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

// Resolve the target user: the logged-in user themselves, or (if admin) a
// specified user passed in the request body.
function resolveTarget(req) {
  if (req.user.role === 'admin' && req.body.user_id) return Number(req.body.user_id)
  return req.user.id
}

// checkedInBy: null when user checks themselves in, admin's id otherwise
function checkedInBy(req, targetId) {
  return req.user.id === targetId ? null : req.user.id
}

// POST /api/checkin/booking/:groupId
// Member or admin checks a user in for a regular court booking.
router.post('/booking/:groupId', requireAuth, async (req, res) => {
  const uid = resolveTarget(req)
  try {
    const { rows } = await pool.query(
      `SELECT date FROM bookings
       WHERE booking_group_id=$1 AND user_id=$2 AND status='confirmed' LIMIT 1`,
      [req.params.groupId, uid]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' })

    await pool.query(
      `INSERT INTO check_ins (user_id, type, reference_id, date, checked_in_by)
       VALUES ($1, 'booking', $2, $3, $4)
       ON CONFLICT (user_id, type, reference_id) DO NOTHING`,
      [uid, req.params.groupId, rows[0].date, checkedInBy(req, uid)]
    )
    res.json({ message: 'Checked in.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/checkin/social/:sessionId
// Member or admin checks a user in for a social play session they joined.
router.post('/social/:sessionId', requireAuth, async (req, res) => {
  const uid = resolveTarget(req)
  try {
    const { rows } = await pool.query(
      `SELECT sps.date FROM social_play_sessions sps
       JOIN social_play_participants spp ON spp.session_id = sps.id
       WHERE sps.id=$1 AND spp.user_id=$2 LIMIT 1`,
      [req.params.sessionId, uid]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Not a participant.' })

    await pool.query(
      `INSERT INTO check_ins (user_id, type, reference_id, date, checked_in_by)
       VALUES ($1, 'social', $2, $3, $4)
       ON CONFLICT (user_id, type, reference_id) DO NOTHING`,
      [uid, req.params.sessionId, rows[0].date, checkedInBy(req, uid)]
    )
    res.json({ message: 'Checked in.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/checkin/coaching/:sessionId
// Student or linked coach (or admin) checks in for a coaching session.
router.post('/coaching/:sessionId', requireAuth, async (req, res) => {
  const uid = resolveTarget(req)
  try {
    const { rows } = await pool.query(
      `SELECT cs.date FROM coaching_sessions cs
       LEFT JOIN coaches co ON co.id = cs.coach_id
       WHERE cs.id=$1 AND (cs.student_id=$2 OR co.user_id=$2)
         AND cs.status='confirmed' LIMIT 1`,
      [req.params.sessionId, uid]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Coaching session not found.' })

    await pool.query(
      `INSERT INTO check_ins (user_id, type, reference_id, date, checked_in_by)
       VALUES ($1, 'coaching', $2, $3, $4)
       ON CONFLICT (user_id, type, reference_id) DO NOTHING`,
      [uid, req.params.sessionId, rows[0].date, checkedInBy(req, uid)]
    )
    res.json({ message: 'Checked in.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/checkin/today
// Returns the logged-in user's check-ins for today.
router.get('/today', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT type, reference_id FROM check_ins
       WHERE user_id=$1 AND date=CURRENT_DATE`,
      [req.user.id]
    )
    res.json({ checkIns: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/checkin/admin?date=YYYY-MM-DD
// Returns all check-ins for a given date — admin only.
router.get('/admin', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const { date } = req.query
  if (!date) return res.status(400).json({ message: 'date is required.' })
  try {
    const { rows } = await pool.query(
      `SELECT ci.type, ci.reference_id, ci.user_id, ci.checked_in_at,
              u.name AS user_name
       FROM check_ins ci
       JOIN users u ON u.id = ci.user_id
       WHERE ci.date=$1
       ORDER BY ci.checked_in_at ASC`,
      [date]
    )
    res.json({ checkIns: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/checkin/today-summary  (admin)
// All activities scheduled for today with per-person check-in status.
router.get('/today-summary', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  try {
    // ── Bookings ─────────────────────────────────────────────────────────────
    const { rows: bookings } = await pool.query(`
      SELECT
        b.booking_group_id              AS group_id,
        MIN(b.start_time)               AS start_time,
        MAX(b.end_time)                 AS end_time,
        ct.name                         AS court_name,
        u.id                            AS user_id,
        u.name                          AS user_name,
        EXISTS(
          SELECT 1 FROM check_ins ci
          WHERE ci.user_id = u.id
            AND ci.type = 'booking'
            AND ci.reference_id = b.booking_group_id::text
        ) AS checked_in
      FROM bookings b
      JOIN users  u  ON u.id  = b.user_id
      JOIN courts ct ON ct.id = b.court_id
      WHERE b.date = CURRENT_DATE AND b.status = 'confirmed'
      GROUP BY b.booking_group_id, ct.name, u.id, u.name
      ORDER BY start_time ASC, u.name ASC
    `)

    // ── Coaching sessions ─────────────────────────────────────────────────────
    const { rows: coaching } = await pool.query(`
      SELECT
        cs.id,
        cs.start_time, cs.end_time,
        ct.name  AS court_name,
        st.id    AS student_id,
        st.name  AS student_name,
        co.name  AS coach_name,
        co_u.id  AS coach_user_id,
        EXISTS(
          SELECT 1 FROM check_ins ci
          WHERE ci.user_id = cs.student_id
            AND ci.type = 'coaching'
            AND ci.reference_id = cs.id::text
        ) AS student_checked_in,
        EXISTS(
          SELECT 1 FROM check_ins ci
          WHERE ci.user_id = co_u.id
            AND ci.type = 'coaching'
            AND ci.reference_id = cs.id::text
        ) AS coach_checked_in,
        EXISTS(
          SELECT 1 FROM check_ins ci
          WHERE ci.type = 'coaching'
            AND ci.reference_id = cs.id::text
            AND ci.checked_in_by IS NOT NULL
        ) AS admin_checked_in
      FROM coaching_sessions cs
      JOIN users  st ON st.id  = cs.student_id
      JOIN coaches co ON co.id = cs.coach_id
      LEFT JOIN users co_u ON co_u.id = co.user_id
      JOIN courts ct ON ct.id = cs.court_id
      WHERE cs.date = CURRENT_DATE AND cs.status = 'confirmed'
      ORDER BY cs.start_time ASC
    `)

    // ── Social play ───────────────────────────────────────────────────────────
    const { rows: social } = await pool.query(`
      SELECT
        sps.id,
        sps.title,
        sps.start_time, sps.end_time,
        u.id   AS user_id,
        u.name AS user_name,
        EXISTS(
          SELECT 1 FROM check_ins ci
          WHERE ci.user_id = spp.user_id
            AND ci.type = 'social'
            AND ci.reference_id = sps.id::text
        ) AS checked_in
      FROM social_play_sessions sps
      JOIN social_play_participants spp ON spp.session_id = sps.id
      JOIN users u ON u.id = spp.user_id
      WHERE sps.date = CURRENT_DATE AND sps.status = 'open'
      ORDER BY sps.start_time ASC, u.name ASC
    `)

    res.json({ bookings, coaching, social })
  } catch (err) {
    console.error('today-summary error:', err)
    res.status(500).json({ message: err.message ?? 'Server error.' })
  }
})

module.exports = router
