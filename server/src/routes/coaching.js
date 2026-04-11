const router         = require('express').Router()
const pool           = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { randomUUID } = require('crypto')
const { checkOpenHours } = require('../utils/scheduleCheck')

// ─── Coaching hours helpers ───────────────────────────────────────────────────

function sessionHours(startTime, endTime) {
  const [sh, sm] = startTime.substring(0, 5).split(':').map(Number)
  const [eh, em] = endTime.substring(0, 5).split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

// Deduct (or refund) hours for one student/session pair within a pg client transaction.
async function ledgerEntry(client, userId, delta, note, sessionId, createdBy) {
  await client.query(
    `INSERT INTO coaching_hour_ledger (user_id, delta, note, session_id, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, delta, note, sessionId ?? null, createdBy ?? null]
  )
}

// ─── COACH CRUD (admin only) ──────────────────────────────────────────────────

// GET /api/coaching/coaches
router.get('/coaches', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT co.*, u.email, u.phone FROM coaches co
       JOIN users u ON u.id = co.user_id
       WHERE co.user_id IS NOT NULL AND u.role = 'coach'
       ORDER BY co.name ASC`
    )
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

// DELETE /api/coaching/coaches/by-user/:userId  — remove coach record by linked user id
router.delete('/coaches/by-user/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM coaches WHERE user_id=$1', [req.params.userId])
    res.json({ message: 'Coach removed.' })
  } catch (err) {
    if (err.code === '23503')
      return res.status(409).json({ message: 'Cannot delete coach with existing sessions.' })
    res.status(500).json({ message: 'Server error.' })
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
         ct.name AS court_name,
         EXISTS(
           SELECT 1 FROM check_ins ci
           WHERE ci.type='coaching'
             AND ci.reference_id = cs.id::text
             AND ci.user_id = cs.student_id
         ) AS checked_in,
         EXISTS(
           SELECT 1 FROM check_ins ci
           WHERE ci.type='coaching'
             AND ci.reference_id = cs.id::text
             AND ci.checked_in_by IS NOT NULL
         ) AS admin_checked_in,
         EXISTS(
           SELECT 1 FROM group_session_leaves gsl
           WHERE gsl.session_id = cs.id AND gsl.student_id = cs.student_id
         ) AS is_makeup
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
// body: { coach_id, student_id, date, start_time, end_time, notes, weeks, recurrence_id? }
// court_id is auto-assigned (first court not blocked by bookings or coaching at that time)
// weeks >= 2 → generate that many weekly instances sharing a recurrence_id
// Pass recurrence_id to append new sessions into an existing series (e.g. makeup sessions)
router.post('/sessions', requireAuth, requireAdmin, async (req, res) => {
  const { coach_id, student_id, date, start_time, end_time, notes, weeks, recurrence_id: existingRecurrenceId } = req.body

  if (!coach_id || !student_id || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'coach_id, student_id, date, start_time and end_time are required.' })

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  if (eh * 60 + em <= sh * 60 + sm)
    return res.status(400).json({ message: 'end_time must be after start_time.' })

  const numWeeks     = Number(weeks) >= 1 ? Math.min(Number(weeks), 52) : 1
  const recurrenceId = existingRecurrenceId || (numWeeks > 1 ? randomUUID() : null)

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
    const skipped  = []   // dates skipped due to no court available
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
      //    Social sessions don't own specific courts, so we check that the
      //    number of free courts exceeds what social sessions need, then pick
      //    the first free court.
      const { rows: free } = await client.query(
        `WITH social_count AS (
           SELECT COALESCE(SUM(num_courts), 0)::int AS total
           FROM social_play_sessions
           WHERE date = $1 AND status = 'open'
             AND start_time < $3::time AND end_time > $2::time
         ),
         free_courts AS (
           SELECT c.id
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
         ),
         free_count AS (SELECT COUNT(*)::int AS n FROM free_courts),
         adj_court AS (
           SELECT court_id FROM coaching_sessions
           WHERE coach_id = $4 AND date = $1 AND status = 'confirmed'
             AND (end_time = $2::time OR start_time = $3::time)
           LIMIT 1
         )
         SELECT fc.id
         FROM free_courts fc, free_count fcnt, social_count sc
         WHERE fcnt.n > sc.total
         ORDER BY
           CASE WHEN fc.id = (SELECT court_id FROM adj_court) THEN 0 ELSE 1 END,
           fc.id
         LIMIT 1`,
        [sessionDate, start_time, end_time, coach_id]
      )
      if (!free[0]) {
        skipped.push(sessionDate)
        continue   // no court this week — skip rather than abort the whole batch
      }

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
    res.status(201).json({ sessions: inserted, recurrence_id: recurrenceId, skipped })
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
         array_agg(cs.id ORDER BY u.name)    AS session_ids,
         array_agg(
           EXISTS(
             SELECT 1 FROM check_ins ci
             WHERE ci.type='coaching'
               AND ci.reference_id = cs.id::text
               AND ci.user_id = cs.student_id
           ) ORDER BY u.name
         ) AS checked_ins,
         array_agg(
           EXISTS(
             SELECT 1 FROM check_ins ci
             WHERE ci.type='coaching'
               AND ci.reference_id = cs.id::text
               AND ci.checked_in_by IS NOT NULL
           ) ORDER BY u.name
         ) AS admin_checked_ins,
         array_agg(
           (SELECT COUNT(*)::int FROM group_session_leaves gl
            WHERE gl.group_id = cs.group_id AND gl.student_id = cs.student_id)
           ORDER BY u.name
         ) AS leave_used,
         array_agg(
           EXISTS(
             SELECT 1 FROM group_session_leaves gsl
             WHERE gsl.session_id = cs.id AND gsl.student_id = cs.student_id
           ) ORDER BY u.name
         ) AS session_is_makeup,
         (SELECT COALESCE(json_object_agg(gsl.student_id::text, gsl.cnt), '{}')
          FROM (
            SELECT student_id, COUNT(*)::int AS cnt
            FROM group_session_leaves
            WHERE group_id = cs.group_id
            GROUP BY student_id
          ) gsl
         ) AS group_leave_map
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

// POST /api/coaching/sessions/group/:groupId/add-student  (admin)
// body: { student_id, from_date? }  — adds student to all confirmed sessions from from_date onwards
router.post('/sessions/group/:groupId/add-student', requireAuth, requireAdmin, async (req, res) => {
  const { student_id, from_date } = req.body
  if (!student_id) return res.status(400).json({ message: 'student_id is required.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Fetch one representative row per remaining date in this group
    const fromDate = from_date || new Date().toISOString().slice(0, 10)
    const { rows: sessions } = await client.query(
      `SELECT DISTINCT ON (date) *
       FROM coaching_sessions
       WHERE group_id=$1 AND status='confirmed' AND date >= $2
       ORDER BY date ASC`,
      [req.params.groupId, fromDate]
    )
    if (sessions.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'No remaining sessions found for this group.' })
    }

    // Check student isn't already in this group
    const { rows: existing } = await client.query(
      `SELECT 1 FROM coaching_sessions
       WHERE group_id=$1 AND student_id=$2 AND status='confirmed' LIMIT 1`,
      [req.params.groupId, student_id]
    )
    if (existing.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Student is already in this group.' })
    }

    // Check max 5 students per session — verify every affected date won't exceed 5
    for (const s of sessions) {
      const { rows: [cnt] } = await client.query(
        `SELECT COUNT(DISTINCT student_id)::int AS n FROM coaching_sessions
         WHERE group_id=$1 AND date=$2 AND status='confirmed'`,
        [req.params.groupId, s.date]
      )
      if (cnt.n >= 5) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: `Adding this student would exceed 5 students on ${s.date}.` })
      }
    }

    const recurrenceId = sessions.length > 1 ? randomUUID() : null

    const inserted = []
    for (const s of sessions) {
      const { rows } = await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id, group_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [s.coach_id, student_id, s.court_id, s.date, s.start_time, s.end_time,
         s.notes, recurrenceId, s.group_id]
      )
      inserted.push(rows[0])
    }

    await client.query('COMMIT')
    res.status(201).json({ sessions: inserted, count: inserted.length })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505')
      return res.status(409).json({ message: 'Student already has a coaching session at that time on one of these dates.' })
    res.status(500).json({ message: 'Server error.' })
  } finally { client.release() }
})

// DELETE /api/coaching/sessions/group/:groupId/remove-student/:studentId  (admin)
// Cancels confirmed sessions for one student in the group from from_date onwards
// Query param: from_date (defaults to today)
router.delete('/sessions/group/:groupId/remove-student/:studentId', requireAuth, requireAdmin, async (req, res) => {
  const fromDate = req.query.from_date || new Date().toISOString().slice(0, 10)

  // Check min 1 student — ensure no affected date would drop to 0
  const { rows: dateCounts } = await pool.query(
    `SELECT date, COUNT(DISTINCT student_id)::int AS n
     FROM coaching_sessions
     WHERE group_id=$1 AND status='confirmed' AND date >= $2
     GROUP BY date`,
    [req.params.groupId, fromDate]
  )
  const wouldEmpty = dateCounts.some(r => r.n <= 1)
  if (wouldEmpty) {
    return res.status(409).json({ message: 'Cannot remove this student — at least 1 student must remain in each session.' })
  }

  const { rows } = await pool.query(
    `UPDATE coaching_sessions SET status='cancelled'
     WHERE group_id=$1 AND student_id=$2 AND status='confirmed' AND date >= $3
     RETURNING id, date, start_time, end_time, student_id`,
    [req.params.groupId, req.params.studentId, fromDate]
  )
  // Mark sessions that were already checked in (hours already deducted, skip refund)
  if (rows.length > 0) {
    const ids = rows.map(r => r.id)
    const { rows: checkedRows } = await pool.query(
      `SELECT DISTINCT session_id FROM coaching_hour_ledger WHERE session_id = ANY($1) AND delta < 0`,
      [ids]
    )
    const checkedSet = new Set(checkedRows.map(r => r.session_id))
    rows.forEach(r => { r.checked_in = checkedSet.has(r.id) })
  }
  res.json({ cancelled: rows.length, sessions: rows })
})

// DELETE /api/coaching/sessions/group/:groupId  (admin) — cancel all confirmed sessions in a group
router.delete('/sessions/group/:groupId', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const { rowCount } = await client.query(
      `UPDATE coaching_sessions SET status='cancelled' WHERE group_id=$1 AND status='confirmed'`,
      [req.params.groupId]
    )
    if (rowCount === 0) return res.status(404).json({ message: 'Group not found.' })
    res.json({ message: 'Group sessions cancelled.' })
  } catch {
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// DELETE /api/coaching/sessions/recurrence/:recurrenceId  — must be before /:id
router.delete('/sessions/recurrence/:recurrenceId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE coaching_sessions SET status='cancelled'
       WHERE recurrence_id=$1 AND date >= CURRENT_DATE AND status='confirmed'`,
      [req.params.recurrenceId]
    )
    res.json({ message: `Cancelled ${rowCount} session(s).`, count: rowCount })
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
    const session = rows[0]
    if (session.status === 'cancelled') return res.status(409).json({ message: 'Session is already cancelled.' })
    const isAdmin   = req.user.role === 'admin'
    const isStudent = session.student_id === req.user.id
    const isCoach   = session.coach_user_id === req.user.id
    if (!isAdmin && !isStudent && !isCoach)
      return res.status(403).json({ message: 'Forbidden.' })

    // For group sessions: record a leave (students only — admin cancellations don't count as leaves)
    if (session.group_id && !isAdmin) {
      const { rows: leaveRows } = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM group_session_leaves WHERE group_id=$1 AND student_id=$2',
        [session.group_id, session.student_id]
      )
      if (leaveRows[0].cnt >= 2)
        return res.status(409).json({
          message: 'Student has already used all 2 leaves for this group series.',
          leaveExhausted: true
        })

      await pool.query(
        `INSERT INTO group_session_leaves (group_id, student_id, session_id, leave_date)
         VALUES ($1, $2, $3, $4)`,
        [session.group_id, session.student_id, session.id, session.date]
      )
    }

    await pool.query("UPDATE coaching_sessions SET status='cancelled' WHERE id=$1", [req.params.id])
    // Deduct hours for full cancellation (no makeup) — caller passes hasMakeup flag to skip
    const deductHours = !req.body?.hasMakeup
    res.json({ message: 'Session cancelled.', deductHours, sessionHours: sessionHours(session.start_time, session.end_time), studentId: session.student_id })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/sessions/:id/leave  — record a leave without cancelling (used for move-to-end)
router.post('/sessions/:id/leave', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM coaching_sessions WHERE id=$1',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    const session = rows[0]
    if (!session.group_id) return res.status(400).json({ message: 'Not a group session.' })

    const { rows: leaveRows } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM group_session_leaves WHERE group_id=$1 AND student_id=$2',
      [session.group_id, session.student_id]
    )
    if (leaveRows[0].cnt >= 2)
      return res.status(409).json({ message: 'Student has already used all 2 leaves for this group series.', leaveExhausted: true })

    await pool.query(
      `INSERT INTO group_session_leaves (group_id, student_id, session_id, leave_date)
       VALUES ($1, $2, $3, $4)`,
      [session.group_id, session.student_id, session.id, session.date]
    )
    res.json({ message: 'Leave recorded.' })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error.' }) }
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
          // Already added this group session — append student name and accumulate check-in status
          const entry = groupEntries[gkey]
          entry.student_names.push(row.student_name)
          entry.student_name = entry.student_names.join(', ')
          if (row.student_checked_in) entry.student_checked_in = true
          // Counted if admin checked in any student in the group
          if (!entry.counted && row.admin_checked_in === true) {
            entry.counted = true
            entry.admin_checked_in = true
            byCoach[row.coach_id].counted++
          }
          continue
        }
        // First row for this group — create entry and track it
        const counted = row.admin_checked_in === true
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
        const counted = row.admin_checked_in === true
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
         ct.name AS court_name,
         EXISTS(SELECT 1 FROM coaching_reviews WHERE session_id=cs.id) AS has_review
       FROM coaching_sessions cs
       JOIN users  u  ON u.id  = cs.student_id
       JOIN courts ct ON ct.id = cs.court_id
       WHERE cs.coach_id = $1
         AND cs.status = 'confirmed'
       ORDER BY cs.date DESC, cs.start_time DESC`,
      [coachRows[0].id]
    )
    res.json({ sessions: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// ── Shared conflict + court-assignment helper used by both reschedule routes ──
// Checks coach, student, and court availability for (sessionDate, newStart, newEnd).
// excludeId: the session being rescheduled (excluded from its own conflict check).
// Returns { courtId } on success, throws a tagged Error on conflict.
async function checkAndAssignCourt(client, session, sessionDate, newStart, newEnd, extraExcludeIds = []) {
  const coachId   = session.coach_id
  const studentId = session.student_id
  const groupId   = session.group_id
  const excludeIds = [...new Set([session.id, ...extraExcludeIds])]

  // ── coach conflicts ──────────────────────────────────────────────────────────
  // Same-group sessions share the coach intentionally — not a conflict
  const { rows: coachBusy } = await client.query(
    `SELECT 1 FROM coaching_sessions
     WHERE coach_id=$1 AND date=$2 AND status='confirmed' AND NOT (id = ANY($5::int[]))
       AND ($6::uuid IS NULL OR group_id IS DISTINCT FROM $6)
       AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
    [coachId, sessionDate, newStart, newEnd, excludeIds, groupId ?? null]
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
     WHERE student_id=$1 AND date=$2 AND status='confirmed' AND NOT (id = ANY($5::int[]))
       AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
    [studentId, sessionDate, newStart, newEnd, excludeIds]
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
       SELECT c.id
       FROM courts c
       WHERE c.id NOT IN (
         SELECT cs2.court_id FROM coaching_sessions cs2
         WHERE cs2.date=$1 AND cs2.status='confirmed' AND NOT (cs2.id = ANY($4::int[]))
           AND ($5::uuid IS NULL OR cs2.group_id IS DISTINCT FROM $5)
           AND cs2.start_time < $3::time AND cs2.end_time > $2::time
       )
       AND c.id NOT IN (
         SELECT b.court_id FROM bookings b
         WHERE b.date=$1 AND b.status='confirmed'
           AND b.start_time < $3::time AND b.end_time > $2::time
       )
     ),
     free_count AS (SELECT COUNT(*)::int AS n FROM free_courts),
     adj_court AS (
       SELECT court_id FROM coaching_sessions
       WHERE coach_id = $6 AND date = $1 AND status = 'confirmed'
         AND NOT (id = ANY($4::int[]))
         AND (end_time = $2::time OR start_time = $3::time)
       LIMIT 1
     )
     SELECT fc.id FROM free_courts fc, free_count fcnt, social_count sc
     WHERE fcnt.n > sc.total
     ORDER BY
       CASE WHEN fc.id = (SELECT court_id FROM adj_court) THEN 0 ELSE 1 END,
       fc.id
     LIMIT 1`,
    [sessionDate, newStart, newEnd, excludeIds, groupId ?? null, coachId]
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
  const allUpdateIds = updates.map(u => u.id)
  try {
    await client.query('BEGIN')

    // Pre-fetch all sessions so we can check group size constraints
    const sessionMap = {}
    for (const u of updates) {
      const { rows: [session] } = await client.query(
        'SELECT * FROM coaching_sessions WHERE id=$1', [u.id]
      )
      if (!session) throw Object.assign(new Error('not_found'), { id: u.id })
      sessionMap[u.id] = session
    }

    // Check group student count on each target date (1–5 per group per date)
    const groupDateMoves = {} // `${group_id}:${date}` → count moving there
    for (const u of updates) {
      const session = sessionMap[u.id]
      if (!session.group_id) continue
      const key = `${session.group_id}:${u.date}`
      groupDateMoves[key] = (groupDateMoves[key] ?? 0) + 1
    }
    for (const [key, movingCount] of Object.entries(groupDateMoves)) {
      const [groupId, date] = key.split(':')
      const { rows: [cnt] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM coaching_sessions
         WHERE group_id=$1 AND date=$2 AND status='confirmed' AND NOT (id = ANY($3::int[]))`,
        [groupId, date, allUpdateIds]
      )
      const total = (cnt?.n ?? 0) + movingCount
      if (total > 5)
        throw Object.assign(new Error('group_too_large'), { date })
      if (total < 1)
        throw Object.assign(new Error('group_too_small'), { date })
    }

    for (const u of updates) {
      const session = sessionMap[u.id]
      const newStart = u.start_time || session.start_time
      const newEnd   = u.end_time   || session.end_time
      const courtId  = await checkAndAssignCourt(client, session, u.date, newStart, newEnd, allUpdateIds)
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
    if (err.message === 'group_too_large')
      return res.status(409).json({ message: `Moving sessions to ${err.date} would exceed 5 students in the group.` })
    if (err.message === 'group_too_small')
      return res.status(409).json({ message: `Moving sessions would leave 0 students on ${err.date}.` })
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

// ─── COACHING HOURS (admin + student) ─────────────────────────────────────────

// GET /api/coaching/hours/:userId  — combined balance + recent transactions (admin or self)
router.get('/hours/:userId', requireAuth, async (req, res) => {
  const targetId = Number(req.params.userId)
  if (req.user.role !== 'admin' && req.user.id !== targetId)
    return res.status(403).json({ message: 'Forbidden.' })
  try {
    const { rows: ledger } = await pool.query(
      `SELECT id, delta, note, session_type, session_id, created_by, created_at
       FROM coaching_hour_ledger
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [targetId]
    )
    const { rows: [bal] } = await pool.query(
      `SELECT COALESCE(SUM(delta), 0)::numeric AS balance
       FROM coaching_hour_ledger WHERE user_id=$1`,
      [targetId]
    )
    const round = v => Math.round(parseFloat(v) * 100) / 100
    res.json({ balance: round(bal.balance), ledger })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/hours/:userId  — admin manually credits or debits dollars
// body: { delta, note }
router.post('/hours/:userId', requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.userId)
  const { delta, note } = req.body
  if (delta === undefined || delta === null || delta === 0)
    return res.status(400).json({ message: 'delta is required and must be non-zero.' })
  try {
    await pool.query(
      `INSERT INTO coaching_hour_ledger (user_id, delta, note, session_type, created_by)
       VALUES ($1, $2, $3, 'credit', $4)`,
      [targetId, delta, note ?? null, req.user.id]
    )
    const { rows: [bal] } = await pool.query(
      `SELECT COALESCE(SUM(delta), 0)::numeric AS balance
       FROM coaching_hour_ledger WHERE user_id=$1`,
      [targetId]
    )
    const round = v => Math.round(parseFloat(v) * 100) / 100
    res.json({ message: 'Balance updated.', balance: round(bal.balance) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// ── Coaching Reviews ──────────────────────────────────────────────────────────

// GET /api/coaching/reviews/session/:sessionId  — get review for a specific session
router.get('/reviews/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM coaching_reviews WHERE session_id=$1',
      [req.params.sessionId]
    )
    res.json({ review: rows[0] ?? null })
  } catch (e) { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/coaching/reviews  — coach creates a review for a session (also auto check-in)
// body: { session_id, skills, body }
router.post('/reviews', requireAuth, async (req, res) => {
  const { session_id, skills = [], body = '' } = req.body
  if (!session_id) return res.status(400).json({ message: 'session_id is required.' })
  if (!skills.length && !body.trim())
    return res.status(400).json({ message: 'At least one skill or notes required.' })
  const client = await pool.connect()
  try {
    const coachRow = await pool.query('SELECT id FROM coaches WHERE user_id=$1', [req.user.id])
    if (!coachRow.rows[0]) return res.status(403).json({ message: 'Not a coach.' })
    const coachId = coachRow.rows[0].id

    await client.query('BEGIN')

    // Insert review
    const { rows } = await client.query(
      `INSERT INTO coaching_reviews (session_id, coach_id, student_id, skills, body)
       SELECT $1, $2, cs.student_id, $3, $4
       FROM coaching_sessions cs WHERE cs.id=$1
       ON CONFLICT (session_id) DO NOTHING
       RETURNING *`,
      [session_id, coachId, JSON.stringify(skills), body.trim()]
    )

    // Auto check-in the student (idempotent)
    const { rows: [sessRow] } = await client.query(
      'SELECT student_id, date, group_id FROM coaching_sessions WHERE id=$1', [session_id]
    )
    if (sessRow) {
      const { rowCount: ciCount } = await client.query(
        `INSERT INTO check_ins (user_id, type, reference_id, date, checked_in_by)
         VALUES ($1, 'coaching', $2, $3, $4)
         ON CONFLICT (user_id, type, reference_id) DO NOTHING`,
        [sessRow.student_id, session_id, sessRow.date, req.user.id]
      )
      // Deduct balance only on first check-in
      if (ciCount > 0) {
        const sessionType = sessRow.group_id ? 'group' : 'solo'
        const { rows: [priceRow] } = await client.query(
          'SELECT price FROM coaching_prices WHERE session_type=$1', [sessionType]
        )
        const amount = priceRow?.price ?? (sessionType === 'group' ? 50 : 70)
        await client.query(
          `INSERT INTO coaching_hour_ledger (user_id, delta, note, session_type, session_id, created_by)
           VALUES ($1, $2, 'Coaching session attended', $3, $4, $5)`,
          [sessRow.student_id, -amount, sessionType, session_id, req.user.id]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ review: rows[0] ?? null })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ message: 'Server error.' })
  } finally { client.release() }
})

// PUT /api/coaching/reviews/:id  — coach updates an existing review
// body: { skills, body }
router.put('/reviews/:id', requireAuth, async (req, res) => {
  const { skills = [], body = '' } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE coaching_reviews SET skills=$1, body=$2, updated_at=NOW()
       WHERE id=$3 AND coach_id=(SELECT id FROM coaches WHERE user_id=$4)
       RETURNING *`,
      [JSON.stringify(skills), body.trim(), req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Review not found.' })
    res.json({ review: rows[0] })
  } catch (e) { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/coaching/my-history  — student sees all past sessions with attendance status
router.get('/my-history', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.id, cs.date, cs.start_time, cs.end_time,
              u.name AS coach_name,
              EXISTS(
                SELECT 1 FROM check_ins ci
                WHERE ci.type='coaching' AND ci.reference_id=cs.id::text AND ci.user_id=cs.student_id
              ) AS checked_in,
              COALESCE((
                SELECT ci.no_show FROM check_ins ci
                WHERE ci.type='coaching' AND ci.reference_id=cs.id::text AND ci.user_id=cs.student_id
                LIMIT 1
              ), FALSE) AS no_show
       FROM coaching_sessions cs
       JOIN coaches co ON co.id = cs.coach_id
       JOIN users u ON u.id = co.user_id
       WHERE cs.student_id=$1 AND cs.status='confirmed' AND cs.date < CURRENT_DATE
       ORDER BY cs.date DESC
       LIMIT 100`,
      [req.user.id]
    )
    res.json({ sessions: rows })
  } catch (e) { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/coaching/reviews/my  — student sees their reviews (with session info + skills)
router.get('/reviews/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cr.id, cr.skills, cr.body, cr.created_at, cr.updated_at,
              u.name AS coach_name,
              cs.date, cs.start_time, cs.end_time
       FROM coaching_reviews cr
       JOIN coaches co ON co.id = cr.coach_id
       JOIN users u ON u.id = co.user_id
       JOIN coaching_sessions cs ON cs.id = cr.session_id
       WHERE cs.student_id=$1
       ORDER BY cs.date DESC`,
      [req.user.id]
    )
    res.json({ reviews: rows })
  } catch (e) { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/coaching/prices  — current session prices (admin only)
router.get('/prices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT session_type, price FROM coaching_prices')
    const prices = Object.fromEntries(rows.map(r => [r.session_type, parseFloat(r.price)]))
    res.json({ prices })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PUT /api/coaching/prices  — update session prices (admin only)
// body: { solo: 70, group: 50 }
router.put('/prices', requireAuth, requireAdmin, async (req, res) => {
  const { solo, group } = req.body
  if (solo === undefined || group === undefined || solo <= 0 || group <= 0)
    return res.status(400).json({ message: 'solo and group prices are required and must be positive.' })
  try {
    await pool.query('UPDATE coaching_prices SET price=$1 WHERE session_type=$2', [solo, 'solo'])
    await pool.query('UPDATE coaching_prices SET price=$1 WHERE session_type=$2', [group, 'group'])
    res.json({ message: 'Prices updated.', prices: { solo, group } })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
