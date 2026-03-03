const router         = require('express').Router()
const pool           = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { randomUUID } = require('crypto')

// ─── COACH CRUD (admin only) ──────────────────────────────────────────────────

// GET /api/coaching/coaches
router.get('/coaches', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM coaches ORDER BY name ASC')
    res.json({ coaches: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/coaches  — body: { name, bio, user_id? }
// If user_id is provided, the linked user's role is set to 'coach'.
router.post('/coaches', requireAuth, requireAdmin, async (req, res) => {
  const { name, bio, user_id } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'name is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'INSERT INTO coaches (name, bio, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), bio ?? null, user_id ?? null]
    )
    if (user_id) {
      await client.query("UPDATE users SET role='coach' WHERE id=$1", [user_id])
    }
    await client.query('COMMIT')
    res.status(201).json({ coach: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ message: 'That user is already linked to a coach.' })
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// DELETE /api/coaching/coaches/:id
router.delete('/coaches/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM coaches WHERE id=$1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ message: 'Coach not found.' })
    res.json({ message: 'Coach deleted.' })
  } catch (err) {
    if (err.code === '23503')
      return res.status(409).json({ message: 'Cannot delete coach with existing sessions.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// ─── SESSION CRUD (admin only) ────────────────────────────────────────────────

// GET /api/coaching/sessions?date=YYYY-MM-DD
router.get('/sessions', requireAuth, requireAdmin, async (req, res) => {
  const { date } = req.query
  try {
    const { rows } = await pool.query(
      `SELECT
         cs.*,
         c.name  AS coach_name,
         u.name  AS student_name,
         u.email AS student_email,
         ct.name AS court_name
       FROM coaching_sessions cs
       JOIN coaches c  ON c.id  = cs.coach_id
       JOIN users   u  ON u.id  = cs.student_id
       JOIN courts  ct ON ct.id = cs.court_id
       WHERE cs.status = 'confirmed'
         ${date ? 'AND cs.date = $1' : ''}
       ORDER BY cs.date ASC, cs.start_time ASC`,
      date ? [date] : []
    )
    res.json({ sessions: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/sessions
// body: { coach_id, student_id, date, start_time, end_time, notes, weeks }
// court_id is auto-assigned (first court not blocked by bookings or coaching at that time)
// weeks >= 2 → generate that many weekly instances sharing a recurrence_id
router.post('/sessions', requireAuth, requireAdmin, async (req, res) => {
  const { coach_id, student_id, date, start_time, end_time, notes, weeks } = req.body

  if (!coach_id || !student_id || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'coach_id, student_id, date, start_time and end_time are required.' })

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  if (eh * 60 + em <= sh * 60 + sm)
    return res.status(400).json({ message: 'end_time must be after start_time.' })

  const numWeeks     = Number(weeks) >= 1 ? Math.min(Number(weeks), 52) : 1
  const recurrenceId = numWeeks > 1 ? randomUUID() : null

  // Build the list of weekly dates starting from `date`
  const dates = []
  const base  = new Date(date + 'T12:00:00Z')
  for (let i = 0; i < numWeeks; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    dates.push(d.toISOString().slice(0, 10))
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = []
    for (const sessionDate of dates) {
      // Auto-assign the first court not blocked by bookings, coaching, or social play
      const { rows: free } = await client.query(
        `SELECT c.id
         FROM courts c
         WHERE c.id NOT IN (
           SELECT cs2.court_id FROM coaching_sessions cs2
           WHERE cs2.date = $1 AND cs2.status = 'confirmed'
             AND cs2.start_time < $3::time AND cs2.end_time > $2::time
         )
         AND c.id NOT IN (
           SELECT b.court_id FROM bookings b
           WHERE b.date = $1 AND b.status = 'confirmed'
             AND b.start_time < $3::time AND b.end_time > $2::time
         )
         AND c.id NOT IN (
           SELECT generate_series(1, sps.num_courts)
           FROM social_play_sessions sps
           WHERE sps.date = $1 AND sps.status = 'open'
             AND sps.start_time < $3::time AND sps.end_time > $2::time
         )
         ORDER BY c.id LIMIT 1`,
        [sessionDate, start_time, end_time]
      )
      if (!free[0])
        throw Object.assign(new Error('no_court'), { sessionDate })

      // Ensure student has no regular booking overlapping this time
      const { rows: stdBook } = await client.query(
        `SELECT 1 FROM bookings
         WHERE user_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [student_id, sessionDate, start_time, end_time]
      )
      if (stdBook.length)
        throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'booking' })

      // Ensure student has no social play sign-up overlapping this time
      const { rows: stdSocial } = await client.query(
        `SELECT 1 FROM social_play_sessions sps
         JOIN social_play_participants spp ON spp.session_id = sps.id
         WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
           AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
        [student_id, sessionDate, start_time, end_time]
      )
      if (stdSocial.length)
        throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'social' })

      const { rows } = await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [coach_id, student_id, free[0].id, sessionDate, start_time, end_time, notes ?? null, recurrenceId]
      )
      inserted.push(rows[0])
    }
    await client.query('COMMIT')
    res.status(201).json({ sessions: inserted, recurrence_id: recurrenceId })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.message === 'no_court')
      return res.status(409).json({ message: `No courts available on ${err.sessionDate} at that time.` })
    if (err.message === 'student_conflict') {
      const what = err.reason === 'booking' ? 'a court booking' : 'a social play session'
      return res.status(409).json({ message: `Student already has ${what} on ${err.sessionDate} at that time.` })
    }
    if (err.code === '23505')
      return res.status(409).json({ message: 'One or more sessions conflict with an existing booking for that student.' })
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// DELETE /api/coaching/sessions/recurrence/:recurrenceId  — must be before /:id
router.delete('/sessions/recurrence/:recurrenceId', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE coaching_sessions SET status='cancelled'
       WHERE recurrence_id=$1 AND date >= CURRENT_DATE AND status='confirmed'`,
      [req.params.recurrenceId]
    )
    res.json({ message: 'Recurring sessions cancelled.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/coaching/sessions/:id  — admin, the assigned student, or the coach can cancel
router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.*, c.user_id AS coach_user_id
       FROM coaching_sessions cs
       JOIN coaches c ON c.id = cs.coach_id
       WHERE cs.id=$1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    const isAdmin   = req.user.role === 'admin'
    const isStudent = rows[0].student_id === req.user.id
    const isCoach   = rows[0].coach_user_id === req.user.id
    if (!isAdmin && !isStudent && !isCoach)
      return res.status(403).json({ message: 'Forbidden.' })

    await pool.query("UPDATE coaching_sessions SET status='cancelled' WHERE id=$1", [req.params.id])
    res.json({ message: 'Session cancelled.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// ─── COACH-FACING ─────────────────────────────────────────────────────────────

// GET /api/coaching/my-coach-sessions  — upcoming sessions the logged-in coach is teaching
router.get('/my-coach-sessions', requireAuth, async (req, res) => {
  try {
    const { rows: coachRows } = await pool.query(
      'SELECT id FROM coaches WHERE user_id=$1',
      [req.user.id]
    )
    if (!coachRows[0]) return res.json({ sessions: [] })

    const { rows } = await pool.query(
      `SELECT
         cs.id,
         cs.date,
         cs.start_time,
         cs.end_time,
         cs.notes,
         cs.recurrence_id,
         u.name  AS student_name,
         ct.name AS court_name
       FROM coaching_sessions cs
       JOIN users  u  ON u.id  = cs.student_id
       JOIN courts ct ON ct.id = cs.court_id
       WHERE cs.coach_id = $1
         AND cs.status = 'confirmed'
         AND cs.date >= CURRENT_DATE
       ORDER BY cs.date ASC, cs.start_time ASC`,
      [coachRows[0].id]
    )
    res.json({ sessions: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// ─── STUDENT-FACING ───────────────────────────────────────────────────────────

// GET /api/coaching/my  — authenticated user's upcoming coaching sessions
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         cs.id,
         cs.date,
         cs.start_time,
         cs.end_time,
         cs.notes,
         cs.status,
         cs.recurrence_id,
         c.name  AS coach_name,
         ct.name AS court_name
       FROM coaching_sessions cs
       JOIN coaches c  ON c.id  = cs.coach_id
       JOIN courts  ct ON ct.id = cs.court_id
       WHERE cs.student_id = $1
         AND cs.status = 'confirmed'
         AND cs.date >= CURRENT_DATE
       ORDER BY cs.date ASC, cs.start_time ASC`,
      [req.user.id]
    )
    res.json({ sessions: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
