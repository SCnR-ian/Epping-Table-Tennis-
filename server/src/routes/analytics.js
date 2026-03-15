const router = require('express').Router()
const pool   = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

// All analytics routes are admin-only
router.use(requireAuth, requireAdmin)

// GET /api/analytics/overview
// Returns:
//   memberGrowth   – weekly new-member counts for the last 12 weeks
//   slotPopularity – day × time-slot activity counts (bookings + coaching + social)
//   attendance     – per-member activity count + last active date
router.get('/overview', async (req, res) => {
  try {
    // ── 1. Member growth (last 12 weeks, grouped by week) ─────────────────────
    const { rows: growthRows } = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week,
        COUNT(*)::int AS new_members
      FROM users
      WHERE role != 'admin'
        AND created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week ASC
    `)

    // ── 2. Slot popularity ────────────────────────────────────────────────────
    // Combine bookings, coaching sessions, and social play into one activity stream.
    // Social play: count num_courts worth of activity for each slot, not specific courts.
    const { rows: slotRows } = await pool.query(`
      WITH activities AS (
        -- Regular bookings
        SELECT date, start_time FROM bookings WHERE status = 'confirmed'
        UNION ALL
        -- Coaching sessions
        SELECT date, start_time FROM coaching_sessions WHERE status = 'confirmed'
        UNION ALL
        -- Social play (each session counts once regardless of courts)
        SELECT date, start_time FROM social_play_sessions WHERE status = 'open'
      )
      SELECT
        TO_CHAR(date, 'Dy') AS day_label,
        EXTRACT(DOW FROM date)::int AS dow,
        TO_CHAR(start_time, 'HH24:MI') AS slot,
        COUNT(*)::int AS count
      FROM activities
      GROUP BY dow, day_label, slot
      ORDER BY dow ASC, slot ASC
    `)

    // ── 3. Member attendance ──────────────────────────────────────────────────
    const { rows: attendanceRows } = await pool.query(`
      WITH activity AS (
        -- Bookings
        SELECT user_id, date FROM bookings WHERE status = 'confirmed'
        UNION ALL
        -- Coaching (student)
        SELECT student_id AS user_id, date FROM coaching_sessions WHERE status = 'confirmed'
        UNION ALL
        -- Social play participants
        SELECT spp.user_id, sps.date
        FROM social_play_participants spp
        JOIN social_play_sessions sps ON sps.id = spp.session_id
        WHERE sps.status != 'cancelled'
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.created_at,
        COUNT(a.user_id)::int     AS total_activities,
        MAX(a.date)               AS last_active
      FROM users u
      LEFT JOIN activity a ON a.user_id = u.id
      WHERE u.role != 'admin'
      GROUP BY u.id, u.name, u.email, u.created_at
      ORDER BY total_activities DESC, u.name ASC
    `)

    res.json({
      memberGrowth:   growthRows,
      slotPopularity: slotRows,
      attendance:     attendanceRows,
    })
  } catch (err) {
    console.error('Analytics error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
