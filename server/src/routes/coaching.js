const router         = require('express').Router()
const pool           = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { randomUUID } = require('crypto')
const { checkOpenHours } = require('../utils/scheduleCheck')

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

    const scheduleError = await checkOpenHours(date, start_time, end_time)
    if (scheduleError) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: scheduleError })
    }

    // Fetch the coach's linked user_id once (for conflict checks on their personal schedule)
    const { rows: coachRows } = await client.query(
      'SELECT user_id FROM coaches WHERE id=$1',
      [coach_id]
    )
    if (!coachRows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Coach not found.' })
    }
    const coachUserId = coachRows[0].user_id

    const inserted = []
    for (const sessionDate of dates) {
      // ── Conflict checks first so errors are always specific ──

      // Ensure the coach is not already teaching another session at this time
      const { rows: coachBusy } = await client.query(
        `SELECT 1 FROM coaching_sessions
         WHERE coach_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [coach_id, sessionDate, start_time, end_time]
      )
      if (coachBusy.length)
        throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'coaching' })

      // If the coach has a linked user account, also check their personal booking/social schedule
      if (coachUserId) {
        const { rows: coachBook } = await client.query(
          `SELECT 1 FROM bookings
           WHERE user_id=$1 AND date=$2 AND status='confirmed'
             AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
          [coachUserId, sessionDate, start_time, end_time]
        )
        if (coachBook.length)
          throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'booking' })

        const { rows: coachSocial } = await client.query(
          `SELECT 1 FROM social_play_sessions sps
           JOIN social_play_participants spp ON spp.session_id = sps.id
           WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
             AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
          [coachUserId, sessionDate, start_time, end_time]
        )
        if (coachSocial.length)
          throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'social' })
      }

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

      // Ensure student has no other coaching session overlapping this time
      const { rows: stdCoaching } = await client.query(
        `SELECT 1 FROM coaching_sessions
         WHERE student_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [student_id, sessionDate, start_time, end_time]
      )
      if (stdCoaching.length)
        throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'coaching' })

      // ── Auto-assign the first court not blocked by bookings or coaching,
      //    accounting for social sessions as a court count (not specific IDs).
      //    Social sessions don't own specific courts, so we rank the free courts
      //    and skip the first N (where N = total courts claimed by social sessions),
      //    then take the next one.
      const { rows: free } = await client.query(
        `WITH social_count AS (
           SELECT COALESCE(SUM(num_courts), 0)::int AS total
           FROM social_play_sessions
           WHERE date = $1 AND status = 'open'
             AND start_time < $3::time AND end_time > $2::time
         ),
         free_courts AS (
           SELECT c.id,
                  ROW_NUMBER() OVER (ORDER BY c.id) AS rn
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
         )
         SELECT fc.id
         FROM free_courts fc, social_count sc
         WHERE fc.rn > sc.total
         ORDER BY fc.rn
         LIMIT 1`,
        [sessionDate, start_time, end_time]
      )
      if (!free[0])
        throw Object.assign(new Error('no_court'), { sessionDate })

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
      const what = err.reason === 'booking' ? 'a court booking' : err.reason === 'social' ? 'a social play session' : 'another coaching session'
      return res.status(409).json({ message: `Student already has ${what} on ${err.sessionDate} at that time.` })
    }
    if (err.message === 'coach_conflict') {
      const what = err.reason === 'coaching' ? 'another session to teach' : err.reason === 'booking' ? 'a court booking' : 'a social play session'
      return res.status(409).json({ message: `Coach already has ${what} on ${err.sessionDate} at that time.` })
    }
    if (err.code === '23505') {
      if (err.constraint === 'coaching_no_coach_overlap')
        return res.status(409).json({ message: 'Coach already has another session to teach at that time.' })
      if (err.constraint === 'coaching_no_student_overlap')
        return res.status(409).json({ message: 'Student already has another coaching session at that time.' })
      if (err.constraint === 'coaching_no_court_overlap')
        return res.status(409).json({ message: 'That court is already booked for coaching at that time.' })
      return res.status(409).json({ message: 'One or more sessions conflict with an existing booking.' })
    }
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

// GET /api/coaching/payment-report?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin only)
// Returns all confirmed sessions in the date range, grouped by coach, with
// per-session check-in status for both the student and the coach.
// A session "counts" toward pay only when BOTH have checked in.
router.get('/payment-report', requireAuth, requireAdmin, async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ message: 'from and to dates are required.' })
  try {
    const { rows } = await pool.query(
      `SELECT
         co.id          AS coach_id,
         co.name        AS coach_name,
         co.user_id     AS coach_user_id,
         cs.id          AS session_id,
         cs.date,
         cs.start_time,
         cs.end_time,
         cs.notes,
         u.id           AS student_id,
         u.name         AS student_name,
         ct.name        AS court_name,
         EXISTS(
           SELECT 1 FROM check_ins ci
           WHERE ci.type='coaching'
             AND ci.reference_id = cs.id::text
             AND ci.user_id = cs.student_id
         ) AS student_checked_in,
         CASE
           WHEN co.user_id IS NULL THEN NULL
           ELSE EXISTS(
             SELECT 1 FROM check_ins ci
             WHERE ci.type='coaching'
               AND ci.reference_id = cs.id::text
               AND ci.user_id = co.user_id
           )
         END AS coach_checked_in,
         EXISTS(
           SELECT 1 FROM check_ins ci
           WHERE ci.type='coaching'
             AND ci.reference_id = cs.id::text
             AND ci.checked_in_by IS NOT NULL
         ) AS admin_checked_in
       FROM coaching_sessions cs
       JOIN coaches co ON co.id  = cs.coach_id
       JOIN users   u  ON u.id   = cs.student_id
       JOIN courts  ct ON ct.id  = cs.court_id
       WHERE cs.status = 'confirmed'
         AND cs.date >= $1 AND cs.date <= $2
       ORDER BY co.name ASC, cs.date ASC, cs.start_time ASC`,
      [from, to]
    )

    // Group rows by coach
    const byCoach = {}
    for (const row of rows) {
      if (!byCoach[row.coach_id]) {
        byCoach[row.coach_id] = {
          coach_id:    row.coach_id,
          coach_name:  row.coach_name,
          has_account: row.coach_user_id != null,
          sessions:    [],
          counted:     0,
          total:       0,
        }
      }
      const counted = row.admin_checked_in === true ||
                      (row.student_checked_in === true && row.coach_checked_in === true)
      byCoach[row.coach_id].sessions.push({
        session_id:          row.session_id,
        date:                row.date,
        start_time:          row.start_time,
        end_time:            row.end_time,
        notes:               row.notes,
        student_name:        row.student_name,
        court_name:          row.court_name,
        student_checked_in:  row.student_checked_in,
        coach_checked_in:    row.coach_checked_in,   // true | false | null (no account)
        admin_checked_in:    row.admin_checked_in,
        counted,
      })
      byCoach[row.coach_id].total++
      if (counted) byCoach[row.coach_id].counted++
    }
    res.json({ coaches: Object.values(byCoach) })
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

// PUT /api/coaching/sessions/:id/reschedule  (admin) — move a single session to a new date
// body: { date: 'YYYY-MM-DD' }
router.put('/sessions/:id/reschedule', requireAuth, requireAdmin, async (req, res) => {
  const { date } = req.body
  if (!date) return res.status(400).json({ message: 'date is required.' })
  try {
    const { rows } = await pool.query(
      `UPDATE coaching_sessions SET date=$1 WHERE id=$2 AND status='confirmed' RETURNING *`,
      [date, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    res.json({ session: rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'That slot is already taken.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// ─── STUDENT-FACING ───────────────────────────────────────────────────────────

// GET /api/coaching/my  — authenticated user's upcoming coaching sessions
// Each session includes series_total and series_remaining (for recurring packages).
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH series_counts AS (
         SELECT
           recurrence_id,
           COUNT(*)::int AS series_total,
           COUNT(*) FILTER (WHERE date >= CURRENT_DATE)::int AS series_remaining
         FROM coaching_sessions
         WHERE student_id = $1 AND status = 'confirmed' AND recurrence_id IS NOT NULL
         GROUP BY recurrence_id
       )
       SELECT
         cs.id, cs.date, cs.start_time, cs.end_time,
         cs.notes, cs.status, cs.recurrence_id,
         c.name  AS coach_name,
         ct.name AS court_name,
         sc.series_total,
         sc.series_remaining
       FROM coaching_sessions cs
       JOIN coaches c  ON c.id  = cs.coach_id
       JOIN courts  ct ON ct.id = cs.court_id
       LEFT JOIN series_counts sc ON sc.recurrence_id = cs.recurrence_id
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
