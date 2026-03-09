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

module.exports = router
