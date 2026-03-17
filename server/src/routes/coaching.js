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

// GET /api/coaching/sessions/groups?date=YYYY-MM-DD  (admin) — group sessions, each row = one group
router.get('/sessions/groups', requireAuth, requireAdmin, async (req, res) => {
  const { date } = req.query
  try {
    const { rows } = await pool.query(
      `SELECT
         cs.group_id,
         cs.date,
         cs.start_time,
         cs.end_time,
         cs.notes,
         cs.court_id,
         ct.name                   AS court_name,
         cs.coach_id,
         co.name                   AS coach_name,
         array_agg(u.id ORDER BY u.name)     AS student_ids,
         array_agg(u.name ORDER BY u.name)   AS student_names,
         array_agg(u.email ORDER BY u.name)  AS student_emails,
         array_agg(cs.id ORDER BY u.name)    AS session_ids
       FROM coaching_sessions cs
       JOIN coaches co ON co.id  = cs.coach_id
       JOIN users   u  ON u.id   = cs.student_id
       JOIN courts  ct ON ct.id  = cs.court_id
       WHERE cs.status = 'confirmed'
         AND cs.group_id IS NOT NULL
         ${date ? 'AND cs.date = $1' : ''}
       GROUP BY cs.group_id, cs.date, cs.start_time, cs.end_time,
                cs.notes, cs.court_id, ct.name, cs.coach_id, co.name
       ORDER BY cs.date ASC, cs.start_time ASC`,
      date ? [date] : []
    )
    res.json({ groups: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/sessions/group  (admin)
// body: { coach_id, student_ids: [id,...] (2-5), date, start_time, end_time, notes, weeks }
// All students share ONE court and ONE group_id. Each student gets their own recurrence_id series.
router.post('/sessions/group', requireAuth, requireAdmin, async (req, res) => {
  const { coach_id, student_ids, date, start_time, end_time, notes, weeks } = req.body

  if (!coach_id || !Array.isArray(student_ids) || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'coach_id, student_ids, date, start_time and end_time are required.' })

  if (student_ids.length < 2 || student_ids.length > 5)
    return res.status(400).json({ message: 'Group sessions require 2–5 students.' })

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  if (eh * 60 + em <= sh * 60 + sm)
    return res.status(400).json({ message: 'end_time must be after start_time.' })

  const numWeeks = Number(weeks) >= 1 ? Math.min(Number(weeks), 52) : 1
  const groupId  = randomUUID()

  // Each student gets their own recurrence_id (for their individual series count)
  const recurrenceIds = student_ids.map(() => numWeeks > 1 ? randomUUID() : null)

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

    // Validate coach exists
    const { rows: coachRows } = await client.query('SELECT user_id FROM coaches WHERE id=$1', [coach_id])
    if (!coachRows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Coach not found.' })
    }
    const coachUserId = coachRows[0].user_id

    const inserted = []

    for (const sessionDate of dates) {
      // ── Coach conflict: can't teach another session at same time
      const { rows: coachBusy } = await client.query(
        `SELECT 1 FROM coaching_sessions
         WHERE coach_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [coach_id, sessionDate, start_time, end_time]
      )
      if (coachBusy.length)
        throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'coaching' })

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

      // ── Per-student conflict checks
      for (const sid of student_ids) {
        const { rows: stdBook } = await client.query(
          `SELECT 1 FROM bookings
           WHERE user_id=$1 AND date=$2 AND status='confirmed'
             AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
          [sid, sessionDate, start_time, end_time]
        )
        if (stdBook.length)
          throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'booking', studentId: sid })

        const { rows: stdSocial } = await client.query(
          `SELECT 1 FROM social_play_sessions sps
           JOIN social_play_participants spp ON spp.session_id = sps.id
           WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
             AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
          [sid, sessionDate, start_time, end_time]
        )
        if (stdSocial.length)
          throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'social', studentId: sid })

        const { rows: stdCoaching } = await client.query(
          `SELECT 1 FROM coaching_sessions
           WHERE student_id=$1 AND date=$2 AND status='confirmed'
             AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
          [sid, sessionDate, start_time, end_time]
        )
        if (stdCoaching.length)
          throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'coaching', studentId: sid })
      }

      // ── Auto-assign ONE court for the whole group
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
             SELECT DISTINCT cs2.court_id FROM coaching_sessions cs2
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

      const courtId = free[0].id

      // ── Insert one row per student, all sharing group_id and courtId
      for (let i = 0; i < student_ids.length; i++) {
        const { rows } = await client.query(
          `INSERT INTO coaching_sessions
             (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id, group_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [coach_id, student_ids[i], courtId, sessionDate, start_time, end_time,
           notes ?? null, recurrenceIds[i], groupId]
        )
        inserted.push(rows[0])
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ sessions: inserted, group_id: groupId })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.message === 'no_court')
      return res.status(409).json({ message: `No courts available on ${err.sessionDate} at that time.` })
    if (err.message === 'student_conflict') {
      const what = err.reason === 'booking' ? 'a court booking' : err.reason === 'social' ? 'a social play session' : 'another coaching session'
      return res.status(409).json({ message: `A student already has ${what} on ${err.sessionDate} at that time.` })
    }
    if (err.message === 'coach_conflict') {
      const what = err.reason === 'coaching' ? 'another session to teach' : err.reason === 'booking' ? 'a court booking' : 'a social play session'
      return res.status(409).json({ message: `Coach already has ${what} on ${err.sessionDate} at that time.` })
    }
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// DELETE /api/coaching/sessions/group/:groupId  (admin) — cancel all confirmed sessions in a group
router.delete('/sessions/group/:groupId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE coaching_sessions SET status='cancelled'
       WHERE group_id=$1 AND status='confirmed'`,
      [req.params.groupId]
    )
    if (rowCount === 0) return res.status(404).json({ message: 'Group not found.' })
    res.json({ message: 'Group sessions cancelled.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
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
         cs.group_id,
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
       ORDER BY co.name ASC, cs.date ASC, cs.start_time ASC, cs.group_id ASC`,
      [from, to]
    )

    // Group rows by coach, deduplicating group sessions (count group as 1)
    const byCoach = {}
    // key → session entry for group sessions already added (group_id → entry)
    const groupEntries = {}
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

      if (row.group_id) {
        const gkey = `${row.coach_id}:${row.group_id}`
        if (groupEntries[gkey]) {
          // Already added this group session — just append the student name
          const entry = groupEntries[gkey]
          entry.student_names.push(row.student_name)
          entry.student_name = entry.student_names.join(', ')
          // If any student checked in, mark student_checked_in true
          if (row.student_checked_in) entry.student_checked_in = true
          continue
        }
        // First row for this group — create entry and track it
        const counted = row.admin_checked_in === true || row.coach_checked_in === true
        const entry = {
          session_id:          row.session_id,
          group_id:            row.group_id,
          date:                row.date,
          start_time:          row.start_time,
          end_time:            row.end_time,
          notes:               row.notes,
          student_names:       [row.student_name],
          student_name:        row.student_name,
          court_name:          row.court_name,
          student_checked_in:  row.student_checked_in,
          coach_checked_in:    row.coach_checked_in,
          admin_checked_in:    row.admin_checked_in,
          is_group:            true,
          counted,
        }
        groupEntries[gkey] = entry
        byCoach[row.coach_id].sessions.push(entry)
        byCoach[row.coach_id].total++
        if (counted) byCoach[row.coach_id].counted++
      } else {
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
          coach_checked_in:    row.coach_checked_in,
          admin_checked_in:    row.admin_checked_in,
          counted,
        })
        byCoach[row.coach_id].total++
        if (counted) byCoach[row.coach_id].counted++
      }
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

// ── Shared conflict + court-assignment helper used by both reschedule routes ──
// Checks coach, student, and court availability for (sessionDate, newStart, newEnd).
// excludeId: the session being rescheduled (excluded from its own conflict check).
// Returns { courtId } on success, throws a tagged Error on conflict.
async function checkAndAssignCourt(client, session, sessionDate, newStart, newEnd) {
  const coachId   = session.coach_id
  const studentId = session.student_id
  const excludeId = session.id

  // ── coach conflicts ──────────────────────────────────────────────────────────
  const { rows: coachBusy } = await client.query(
    `SELECT 1 FROM coaching_sessions
     WHERE coach_id=$1 AND date=$2 AND status='confirmed' AND id!=$5
       AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
    [coachId, sessionDate, newStart, newEnd, excludeId]
  )
  if (coachBusy.length)
    throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'coaching' })

  const { rows: [coachRow] } = await client.query('SELECT user_id FROM coaches WHERE id=$1', [coachId])
  const coachUserId = coachRow?.user_id
  if (coachUserId) {
    const { rows: coachBook } = await client.query(
      `SELECT 1 FROM bookings
       WHERE user_id=$1 AND date=$2 AND status='confirmed'
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [coachUserId, sessionDate, newStart, newEnd]
    )
    if (coachBook.length)
      throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'booking' })

    const { rows: coachSocial } = await client.query(
      `SELECT 1 FROM social_play_sessions sps
       JOIN social_play_participants spp ON spp.session_id = sps.id
       WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
         AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
      [coachUserId, sessionDate, newStart, newEnd]
    )
    if (coachSocial.length)
      throw Object.assign(new Error('coach_conflict'), { sessionDate, reason: 'social' })
  }

  // ── student conflicts ────────────────────────────────────────────────────────
  const { rows: stdBook } = await client.query(
    `SELECT 1 FROM bookings
     WHERE user_id=$1 AND date=$2 AND status='confirmed'
       AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
    [studentId, sessionDate, newStart, newEnd]
  )
  if (stdBook.length)
    throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'booking' })

  const { rows: stdSocial } = await client.query(
    `SELECT 1 FROM social_play_sessions sps
     JOIN social_play_participants spp ON spp.session_id = sps.id
     WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
       AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
    [studentId, sessionDate, newStart, newEnd]
  )
  if (stdSocial.length)
    throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'social' })

  const { rows: stdCoach } = await client.query(
    `SELECT 1 FROM coaching_sessions
     WHERE student_id=$1 AND date=$2 AND status='confirmed' AND id!=$5
       AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
    [studentId, sessionDate, newStart, newEnd, excludeId]
  )
  if (stdCoach.length)
    throw Object.assign(new Error('student_conflict'), { sessionDate, reason: 'coaching' })

  // ── free court ───────────────────────────────────────────────────────────────
  const { rows: free } = await client.query(
    `WITH social_count AS (
       SELECT COALESCE(SUM(num_courts), 0)::int AS total
       FROM social_play_sessions
       WHERE date=$1 AND status='open'
         AND start_time < $3::time AND end_time > $2::time
     ),
     free_courts AS (
       SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
       FROM courts c
       WHERE c.id NOT IN (
         SELECT cs2.court_id FROM coaching_sessions cs2
         WHERE cs2.date=$1 AND cs2.status='confirmed' AND cs2.id!=$4
           AND cs2.start_time < $3::time AND cs2.end_time > $2::time
       )
       AND c.id NOT IN (
         SELECT b.court_id FROM bookings b
         WHERE b.date=$1 AND b.status='confirmed'
           AND b.start_time < $3::time AND b.end_time > $2::time
       )
     )
     SELECT fc.id FROM free_courts fc, social_count sc
     WHERE fc.rn > sc.total ORDER BY fc.rn LIMIT 1`,
    [sessionDate, newStart, newEnd, excludeId]
  )
  if (!free[0])
    throw Object.assign(new Error('no_court'), { sessionDate })

  return free[0].id
}

function rescheduleConflictResponse(err, res) {
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
  if (err.code === '23505')
    return res.status(409).json({ message: 'That slot is already taken.' })
  return res.status(500).json({ message: 'Server error.' })
}

// PUT /api/coaching/sessions/reschedule-bulk  (admin) — move multiple sessions at once
// body: { updates: [{ id, date, start_time?, end_time? }] }
router.put('/sessions/reschedule-bulk', requireAuth, requireAdmin, async (req, res) => {
  const { updates } = req.body
  if (!Array.isArray(updates) || !updates.length)
    return res.status(400).json({ message: 'updates array is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const u of updates) {
      const { rows: [session] } = await client.query(
        'SELECT * FROM coaching_sessions WHERE id=$1', [u.id]
      )
      if (!session) throw Object.assign(new Error('not_found'), { id: u.id })

      const newStart = u.start_time || session.start_time
      const newEnd   = u.end_time   || session.end_time
      const courtId  = await checkAndAssignCourt(client, session, u.date, newStart, newEnd)
      await client.query(
        'UPDATE coaching_sessions SET date=$1, start_time=$2, end_time=$3, court_id=$4 WHERE id=$5',
        [u.date, newStart, newEnd, courtId, u.id]
      )
    }
    await client.query('COMMIT')
    res.json({ message: 'Sessions rescheduled.' })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.message === 'not_found')
      return res.status(404).json({ message: `Session ${err.id} not found.` })
    return rescheduleConflictResponse(err, res)
  } finally { client.release() }
})

// PUT /api/coaching/sessions/group/:groupId/reschedule  (admin) — move all sessions in a group
// body: { date, start_time?, end_time? }
router.put('/sessions/group/:groupId/reschedule', requireAuth, requireAdmin, async (req, res) => {
  const { groupId } = req.params
  const { date, start_time, end_time } = req.body
  if (!date) return res.status(400).json({ message: 'date is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: sessions } = await client.query(
      `SELECT * FROM coaching_sessions WHERE group_id=$1 AND status='confirmed' ORDER BY id ASC`,
      [groupId]
    )
    if (!sessions.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Group session not found.' })
    }

    const sample     = sessions[0]
    const newStart   = start_time || sample.start_time
    const newEnd     = end_time   || sample.end_time
    const excludeIds = sessions.map(s => s.id)

    // ── coach conflict (once for the whole group) ────────────────────────────
    const { rows: coachBusy } = await client.query(
      `SELECT 1 FROM coaching_sessions
       WHERE coach_id=$1 AND date=$2 AND status='confirmed' AND NOT (id = ANY($5::int[]))
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [sample.coach_id, date, newStart, newEnd, excludeIds]
    )
    if (coachBusy.length)
      throw Object.assign(new Error('coach_conflict'), { sessionDate: date, reason: 'coaching' })

    const { rows: [coachRow] } = await client.query('SELECT user_id FROM coaches WHERE id=$1', [sample.coach_id])
    const coachUserId = coachRow?.user_id
    if (coachUserId) {
      const { rows: cb } = await client.query(
        `SELECT 1 FROM bookings WHERE user_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [coachUserId, date, newStart, newEnd]
      )
      if (cb.length) throw Object.assign(new Error('coach_conflict'), { sessionDate: date, reason: 'booking' })

      const { rows: cs } = await client.query(
        `SELECT 1 FROM social_play_sessions sps
         JOIN social_play_participants spp ON spp.session_id = sps.id
         WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
           AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
        [coachUserId, date, newStart, newEnd]
      )
      if (cs.length) throw Object.assign(new Error('coach_conflict'), { sessionDate: date, reason: 'social' })
    }

    // ── per-student conflict checks ──────────────────────────────────────────
    for (const session of sessions) {
      const sid = session.student_id
      const { rows: sb } = await client.query(
        `SELECT 1 FROM bookings WHERE user_id=$1 AND date=$2 AND status='confirmed'
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [sid, date, newStart, newEnd]
      )
      if (sb.length) throw Object.assign(new Error('student_conflict'), { sessionDate: date, reason: 'booking' })

      const { rows: ss } = await client.query(
        `SELECT 1 FROM social_play_sessions sps
         JOIN social_play_participants spp ON spp.session_id = sps.id
         WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
           AND sps.start_time < $4::time AND sps.end_time > $3::time LIMIT 1`,
        [sid, date, newStart, newEnd]
      )
      if (ss.length) throw Object.assign(new Error('student_conflict'), { sessionDate: date, reason: 'social' })

      const { rows: sc } = await client.query(
        `SELECT 1 FROM coaching_sessions
         WHERE student_id=$1 AND date=$2 AND status='confirmed' AND NOT (id = ANY($5::int[]))
           AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
        [sid, date, newStart, newEnd, excludeIds]
      )
      if (sc.length) throw Object.assign(new Error('student_conflict'), { sessionDate: date, reason: 'coaching' })
    }

    // ── find a free court (exclude all group session IDs) ────────────────────
    const { rows: free } = await client.query(
      `WITH social_count AS (
         SELECT COALESCE(SUM(num_courts), 0)::int AS total
         FROM social_play_sessions
         WHERE date=$1 AND status='open'
           AND start_time < $3::time AND end_time > $2::time
       ),
       free_courts AS (
         SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
         FROM courts c
         WHERE c.id NOT IN (
           SELECT DISTINCT cs2.court_id FROM coaching_sessions cs2
           WHERE cs2.date=$1 AND cs2.status='confirmed' AND NOT (cs2.id = ANY($4::int[]))
             AND cs2.start_time < $3::time AND cs2.end_time > $2::time
         )
         AND c.id NOT IN (
           SELECT b.court_id FROM bookings b
           WHERE b.date=$1 AND b.status='confirmed'
             AND b.start_time < $3::time AND b.end_time > $2::time
         )
       )
       SELECT fc.id FROM free_courts fc, social_count sc
       WHERE fc.rn > sc.total ORDER BY fc.rn LIMIT 1`,
      [date, newStart, newEnd, excludeIds]
    )
    if (!free[0]) throw Object.assign(new Error('no_court'), { sessionDate: date })

    await client.query(
      `UPDATE coaching_sessions SET date=$1, start_time=$2, end_time=$3, court_id=$4
       WHERE group_id=$5 AND status='confirmed'`,
      [date, newStart, newEnd, free[0].id, groupId]
    )
    await client.query('COMMIT')
    res.json({ message: 'Group session rescheduled.' })
  } catch (err) {
    await client.query('ROLLBACK')
    return rescheduleConflictResponse(err, res)
  } finally { client.release() }
})

// PUT /api/coaching/sessions/:id/reschedule  (admin) — move a single session to a new date/time
// body: { date: 'YYYY-MM-DD', start_time?, end_time? }
router.put('/sessions/:id/reschedule', requireAuth, requireAdmin, async (req, res) => {
  const { date, start_time, end_time } = req.body
  if (!date) return res.status(400).json({ message: 'date is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [session] } = await client.query(
      'SELECT * FROM coaching_sessions WHERE id=$1', [req.params.id]
    )
    if (!session) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Session not found.' })
    }
    const newStart = start_time || session.start_time
    const newEnd   = end_time   || session.end_time
    const courtId  = await checkAndAssignCourt(client, session, date, newStart, newEnd)
    const { rows } = await client.query(
      'UPDATE coaching_sessions SET date=$1, start_time=$2, end_time=$3, court_id=$4 WHERE id=$5 RETURNING *',
      [date, newStart, newEnd, courtId, session.id]
    )
    await client.query('COMMIT')
    res.json({ session: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    return rescheduleConflictResponse(err, res)
  } finally { client.release() }
})

// ─── STUDENT-FACING ───────────────────────────────────────────────────────────

// GET /api/coaching/my  — authenticated user's upcoming coaching sessions.
// series_total  = all sessions scheduled in the recurring series
// series_used   = sessions that have been "counted" (admin checked-in OR both student+coach checked in)
// sessions_left = series_total - series_used
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH session_checkins AS (
         -- Determine whether each past session in this student's series "counted"
         SELECT
           cs.id AS session_id,
           cs.recurrence_id,
           cs.date,
           (
             EXISTS(
               SELECT 1 FROM check_ins ci
               WHERE ci.type = 'coaching'
                 AND ci.reference_id = cs.id::text
                 AND ci.checked_in_by IS NOT NULL
             ) OR (
               EXISTS(
                 SELECT 1 FROM check_ins ci
                 WHERE ci.type = 'coaching'
                   AND ci.reference_id = cs.id::text
                   AND ci.user_id = cs.student_id
               ) AND EXISTS(
                 SELECT 1 FROM check_ins ci
                 WHERE ci.type = 'coaching'
                   AND ci.reference_id = cs.id::text
                   AND ci.user_id = (SELECT co.user_id FROM coaches co WHERE co.id = cs.coach_id)
               )
             )
           ) AS counted
         FROM coaching_sessions cs
         WHERE cs.student_id = $1
           AND cs.status = 'confirmed'
           AND cs.recurrence_id IS NOT NULL
       ),
       series_counts AS (
         SELECT
           recurrence_id,
           COUNT(*)::int                               AS series_total,
           COUNT(*) FILTER (WHERE counted)::int        AS series_used
         FROM session_checkins
         GROUP BY recurrence_id
       )
       SELECT
         cs.id, cs.date, cs.start_time, cs.end_time,
         cs.notes, cs.status, cs.recurrence_id,
         c.name  AS coach_name,
         ct.name AS court_name,
         sc.series_total,
         sc.series_used
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
