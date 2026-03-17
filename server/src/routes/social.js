const router = require('express').Router()
const pool   = require('../db')
const jwt    = require('jsonwebtoken')
const crypto = require('crypto')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { checkOpenHours } = require('../utils/scheduleCheck')

// Reads JWT if present but never rejects — optional auth
function softAuth(req) {
  try {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer '))
      req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET)
  } catch { /* proceed as guest */ }
}

const SESSION_COLS = `
  s.id, s.title, s.description, s.date, s.start_time, s.end_time,
  s.max_players, s.num_courts, s.status, s.recurrence_id, s.created_at,
  COUNT(p.user_id)::int AS participant_count
`

// GET /api/social
// Upcoming open sessions. If authenticated: participant names + joined flag.
router.get('/', async (req, res) => {
  softAuth(req)
  const userId = req.user?.id ?? null
  try {
    const { rows: sessions } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       WHERE s.date >= CURRENT_DATE AND s.status = 'open'
       GROUP BY s.id
       ORDER BY s.date ASC, s.start_time ASC`
    )

    let participantRows = []
    if (userId && sessions.length) {
      const ids = sessions.map(s => s.id)
      const { rows } = await pool.query(
        `SELECT p.session_id, u.id AS user_id, u.name
         FROM social_play_participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.session_id = ANY($1)
         ORDER BY p.joined_at ASC`,
        [ids]
      )
      participantRows = rows
    }

    const result = sessions.map(s => ({
      ...s,
      participants: userId
        ? participantRows
            .filter(p => p.session_id === s.id)
            .map(p => ({ id: p.user_id, name: p.name }))
        : [],
      joined: userId
        ? participantRows.some(p => p.session_id === s.id && p.user_id === userId)
        : false,
    }))

    res.json({ sessions: result })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/social/admin?date=YYYY-MM-DD
// Admin view — all upcoming sessions, optionally filtered to a single date.
router.get('/admin', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const { date } = req.query
  try {
    const whereClause = date ? 'WHERE s.date = $1' : 'WHERE s.date >= CURRENT_DATE'
    const queryParams = date ? [date] : []

    const { rows: sessions } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       ${whereClause}
       GROUP BY s.id
       ORDER BY s.date ASC, s.start_time ASC`,
      queryParams
    )

    const ids = sessions.map(s => s.id)
    let participantRows = []
    if (ids.length) {
      const { rows } = await pool.query(
        `SELECT p.session_id, u.id AS user_id, u.name
         FROM social_play_participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.session_id = ANY($1)
         ORDER BY p.joined_at ASC`,
        [ids]
      )
      participantRows = rows
    }

    const result = sessions.map(s => ({
      ...s,
      participants: participantRows
        .filter(p => p.session_id === s.id)
        .map(p => ({ id: p.user_id, name: p.name })),
    }))

    res.json({ sessions: result })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// Returns an error string if `requestedCourts` courts are not free during
// [startTime, endTime) on `date`, excluding session `excludeId` (null = no exclusion).
async function checkCourtsAvailable(date, startTime, endTime, excludeId, requestedCourts) {
  // Use generate_series(0, n-1) with integer offsets to avoid any time-type ambiguity.
  // Slot n starts at startTime + n*30min.
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(bk.cnt + cs.cnt + sp.cnt), 0) AS max_other
     FROM generate_series(
       0,
       (  EXTRACT(HOUR   FROM $3::time)::int * 60 + EXTRACT(MINUTE FROM $3::time)::int
        - EXTRACT(HOUR   FROM $2::time)::int * 60 - EXTRACT(MINUTE FROM $2::time)::int
       ) / 30 - 1
     ) AS gs(slot_n)
     CROSS JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt FROM bookings
       WHERE date=$1 AND status='confirmed'
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) bk
     CROSS JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt FROM coaching_sessions
       WHERE date=$1 AND status='confirmed'
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) cs
     CROSS JOIN LATERAL (
       SELECT COALESCE(SUM(num_courts), 0)::int AS cnt FROM social_play_sessions
       WHERE date=$1 AND status='open'
         AND ($4::int IS NULL OR id != $4)
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) sp`,
    [date, startTime, endTime, excludeId ?? null]
  )
  const maxOther = Number(rows[0].max_other)
  if (maxOther + requestedCourts > 6) {
    const free = 6 - maxOther
    return `Only ${free} court${free !== 1 ? 's' : ''} free during that window. Cannot assign ${requestedCourts}.`
  }
  return null
}

// POST /api/social — admin creates a session (supports weeks for recurrence)
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })

  const { title, description, num_courts, date, start_time, end_time, max_players, weeks } = req.body
  const courts   = Math.min(Math.max(Number(num_courts) || 1, 1), 6)
  const numWeeks = Math.min(Math.max(Number(weeks) || 1, 1), 52)
  if (!date || !start_time || !end_time)
    return res.status(400).json({ message: 'date, start_time, end_time are required.' })

  // Build the list of dates for all weekly occurrences
  const dates = []
  const baseDate = new Date(date + 'T12:00:00')
  for (let i = 0; i < numWeeks; i++) {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + i * 7)
    dates.push(d.toISOString().slice(0, 10))
  }

  const recurrenceId = numWeeks > 1 ? crypto.randomUUID() : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Validate each date
    for (const d of dates) {
      const scheduleError = await checkOpenHours(d, start_time, end_time)
      if (scheduleError) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: `${d}: ${scheduleError}` })
      }
      const availError = await checkCourtsAvailable(d, start_time, end_time, null, courts)
      if (availError) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: `${d}: ${availError}` })
      }
    }

    const insertedIds = []
    for (const d of dates) {
      const { rows } = await client.query(
        `INSERT INTO social_play_sessions
           (title, description, num_courts, date, start_time, end_time, max_players, created_by, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          title || 'Social Play',
          description || null,
          courts, d, start_time, end_time,
          max_players || 12,
          req.user.id,
          recurrenceId,
        ]
      )
      insertedIds.push(rows[0].id)
    }

    await client.query('COMMIT')

    const { rows: full } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       WHERE s.id = ANY($1)
       GROUP BY s.id
       ORDER BY s.date ASC`,
      [insertedIds]
    )
    const sessions = full.map(s => ({ ...s, participants: [], joined: false }))
    res.status(201).json({ sessions })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ message: err.message ?? 'Server error.' })
  } finally {
    client.release()
  }
})

// PATCH /api/social/:id — admin updates num_courts and/or time window
router.patch('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })

  try {
    const { num_courts, start_time, end_time } = req.body
    const updates = []
    const values  = []

    // Fetch current session
    const { rows: cur } = await pool.query(
      'SELECT date, start_time, end_time, num_courts FROM social_play_sessions WHERE id=$1',
      [req.params.id]
    )
    if (!cur[0]) return res.status(404).json({ message: 'Session not found.' })
    const sess = cur[0]

    const toM = t => { const [h, m] = t.substring(0, 5).split(':').map(Number); return h * 60 + m }

    const finalCourts = num_courts !== undefined ? Math.min(Math.max(Number(num_courts), 1), 6) : sess.num_courts
    const finalStart  = start_time !== undefined ? start_time : sess.start_time.substring(0, 5)
    const finalEnd    = end_time   !== undefined ? end_time   : sess.end_time.substring(0, 5)

    const courtsIncreasing = finalCourts > sess.num_courts
    const timeExpanding    = toM(finalStart) < toM(sess.start_time.substring(0, 5)) ||
                             toM(finalEnd)   > toM(sess.end_time.substring(0, 5))

    if (courtsIncreasing || timeExpanding) {
      const availError = await checkCourtsAvailable(
        sess.date, finalStart, finalEnd, Number(req.params.id), finalCourts
      )
      if (availError) return res.status(409).json({ message: availError })
    }

    if (num_courts !== undefined) {
      updates.push(`num_courts=$${values.length + 1}`)
      values.push(finalCourts)
    }
    if (start_time !== undefined) {
      updates.push(`start_time=$${values.length + 1}`)
      values.push(start_time)
    }
    if (end_time !== undefined) {
      updates.push(`end_time=$${values.length + 1}`)
      values.push(end_time)
    }
    if (updates.length === 0)
      return res.status(400).json({ message: 'Nothing to update.' })

    values.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE social_play_sessions SET ${updates.join(', ')}
       WHERE id=$${values.length} RETURNING *`,
      values
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    res.json({ session: rows[0] })
  } catch (err) { res.status(500).json({ message: err.message ?? 'Server error.' }) }
})

// DELETE /api/social/recurrence/:recurrenceId — cancel all future sessions in a series
router.delete('/recurrence/:recurrenceId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM social_play_sessions WHERE recurrence_id=$1 AND date >= CURRENT_DATE`,
      [req.params.recurrenceId]
    )
    res.json({ message: `Cancelled ${rowCount} session(s).`, count: rowCount })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/social/:id — admin deletes a session
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  try {
    const { rows } = await pool.query(
      'SELECT id FROM social_play_sessions WHERE id=$1', [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    await pool.query('DELETE FROM social_play_sessions WHERE id=$1', [req.params.id])
    res.json({ message: 'Session deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/social/:id/join — member joins a session
router.post('/:id/join', requireAuth, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock the session row so concurrent joins can't both pass the capacity check
    const { rows } = await client.query(
      `SELECT id, date, start_time, end_time, max_players,
         (SELECT COUNT(*)::int FROM social_play_participants WHERE session_id=$1) AS count
       FROM social_play_sessions
       WHERE id=$1 AND status='open'
       FOR UPDATE`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found or not open.' })
    if (rows[0].count >= rows[0].max_players)
      return res.status(409).json({ message: 'Session is full.' })

    const { date, start_time, end_time } = rows[0]

    // Ensure no regular booking for this member overlaps the session time
    const { rows: bookConflict } = await client.query(
      `SELECT 1 FROM bookings
       WHERE user_id=$1 AND date=$2 AND status='confirmed'
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time]
    )
    if (bookConflict.length)
      return res.status(409).json({ message: 'You have a court booking during that time.' })

    // Ensure no coaching session for this member overlaps the session time
    const { rows: coachConflict } = await client.query(
      `SELECT 1 FROM coaching_sessions
       WHERE student_id=$1 AND date=$2 AND status='confirmed'
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time]
    )
    if (coachConflict.length)
      return res.status(409).json({ message: 'You have a coaching session during that time.' })

    // Ensure the member is not already signed up for another social play session at the same time
    const { rows: socialConflict } = await client.query(
      `SELECT 1 FROM social_play_sessions sps
       JOIN social_play_participants spp ON spp.session_id = sps.id
       WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open'
         AND sps.start_time < $4::time AND sps.end_time > $3::time
         AND sps.id != $5 LIMIT 1`,
      [req.user.id, date, start_time, end_time, req.params.id]
    )
    if (socialConflict.length)
      return res.status(409).json({ message: 'You are already signed up for another social play session during that time.' })

    // Ensure the user (if they are a coach) is not teaching during this time
    const { rows: coachTeachConflict } = await client.query(
      `SELECT 1 FROM coaching_sessions cs
       JOIN coaches co ON co.id = cs.coach_id
       WHERE co.user_id=$1 AND cs.date=$2 AND cs.status='confirmed'
         AND cs.start_time < $4::time AND cs.end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time]
    )
    if (coachTeachConflict.length)
      return res.status(409).json({ message: 'You have a coaching session to teach during that time.' })

    await client.query(
      'INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)',
      [req.params.id, req.user.id]
    )
    await client.query('COMMIT')
    res.status(201).json({ message: 'Joined.' })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ message: 'Already joined.' })
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// DELETE /api/social/:id/join — member leaves a session
router.delete('/:id/join', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM social_play_participants WHERE session_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    )
    if (rowCount === 0) return res.status(404).json({ message: 'Not a participant.' })
    res.json({ message: 'Left session.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/social/:id/participants  (admin) — add a member to a session
router.post('/:id/participants', requireAuth, requireAdmin, async (req, res) => {
  const { user_id } = req.body
  if (!user_id) return res.status(400).json({ message: 'user_id is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT id, max_players,
         (SELECT COUNT(*)::int FROM social_play_participants WHERE session_id=$1) AS count
       FROM social_play_sessions WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Session not found.' })
    }
    if (rows[0].count >= rows[0].max_players) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Session is full.' })
    }
    await client.query(
      'INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)',
      [req.params.id, user_id]
    )
    await client.query('COMMIT')
    res.status(201).json({ message: 'Added.' })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ message: 'Member is already in this session.' })
    res.status(500).json({ message: 'Server error.' })
  } finally { client.release() }
})

// DELETE /api/social/:id/participants/:userId  (admin) — remove a member from a session
router.delete('/:id/participants/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM social_play_participants WHERE session_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    )
    if (rowCount === 0) return res.status(404).json({ message: 'Participant not found.' })
    res.json({ message: 'Removed.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
