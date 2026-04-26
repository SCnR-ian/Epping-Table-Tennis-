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
    if (h?.startsWith('Bearer ')) {
      const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET)
      if (!req.club || payload.club_id === undefined || payload.club_id === req.club.id) {
        req.user = payload
      }
    }
  } catch { /* proceed as guest */ }
}

const SESSION_COLS = `
  s.id, s.title, s.description, s.date, s.start_time, s.end_time,
  s.max_players, s.num_courts, s.status, s.recurrence_id, s.created_at,
  COUNT(p.user_id)::int AS participant_count,
  (SELECT COUNT(*)::int FROM social_play_participants pp JOIN users uu ON uu.id = pp.user_id WHERE pp.session_id = s.id AND NOT uu.is_walkin) AS online_count,
  (SELECT COUNT(*)::int FROM social_play_participants pp JOIN users uu ON uu.id = pp.user_id WHERE pp.session_id = s.id AND uu.is_walkin) AS walkin_count
`

// GET /api/social
router.get('/', async (req, res) => {
  softAuth(req)
  const userId = req.user?.id ?? null
  const clubId = req.club?.id ?? 1
  try {
    const { rows: sessions } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       WHERE s.date >= CURRENT_DATE AND s.status = 'open' AND s.club_id = $1
       GROUP BY s.id
       ORDER BY s.date ASC, s.start_time ASC`,
      [clubId]
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
        ? participantRows.filter(p => p.session_id === s.id).map(p => ({ id: p.user_id, name: p.name }))
        : [],
      joined: userId
        ? participantRows.some(p => p.session_id === s.id && p.user_id === userId)
        : false,
    }))

    res.json({ sessions: result })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/social/admin?date=YYYY-MM-DD
router.get('/admin', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const { date } = req.query
  const clubId = req.club?.id ?? 1
  try {
    const whereClause = date
      ? 'WHERE s.date = $1 AND s.club_id = $2'
      : 'WHERE s.date >= CURRENT_DATE AND s.club_id = $2'
    const queryParams = date ? [date, clubId] : [undefined, clubId].filter((_, i) => i !== 0).concat([clubId])

    // Simpler approach: always pass both params
    const { rows: sessions } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       WHERE ${date ? 's.date = $1 AND ' : 's.date >= CURRENT_DATE AND '}s.club_id = ${date ? '$2' : '$1'}
       GROUP BY s.id
       ORDER BY s.date ASC, s.start_time ASC`,
      date ? [date, clubId] : [clubId]
    )

    const ids = sessions.map(s => s.id)
    let participantRows = []
    if (ids.length) {
      const { rows } = await pool.query(
        `SELECT p.session_id, u.id AS user_id, u.name, u.is_walkin
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
        .map(p => ({ id: p.user_id, name: p.name, is_walkin: p.is_walkin })),
    }))

    res.json({ sessions: result })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// Check court availability within a club
async function checkCourtsAvailable(date, startTime, endTime, excludeId, requestedCourts, clubId) {
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
       WHERE date=$1 AND status='confirmed' AND club_id=$5
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) bk
     CROSS JOIN LATERAL (
       SELECT COUNT(DISTINCT court_id)::int AS cnt FROM coaching_sessions
       WHERE date=$1 AND status='confirmed' AND club_id=$5
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) cs
     CROSS JOIN LATERAL (
       SELECT COALESCE(SUM(num_courts), 0)::int AS cnt FROM social_play_sessions
       WHERE date=$1 AND status='open' AND club_id=$5
         AND ($4::int IS NULL OR id != $4)
         AND start_time <= ($2::time + gs.slot_n * INTERVAL '30 minutes')
         AND end_time   >  ($2::time + gs.slot_n * INTERVAL '30 minutes')
     ) sp`,
    [date, startTime, endTime, excludeId ?? null, clubId]
  )
  const maxOther = Number(rows[0].max_other)
  if (maxOther + requestedCourts > 6) {
    const free = 6 - maxOther
    return `Only ${free} court${free !== 1 ? 's' : ''} free during that window. Cannot assign ${requestedCourts}.`
  }
  return null
}

// POST /api/social
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })

  const { title, description, num_courts, date, start_time, end_time, max_players, weeks } = req.body
  const courts   = Math.min(Math.max(Number(num_courts) || 1, 1), 6)
  const numWeeks = Math.min(Math.max(Number(weeks) || 1, 1), 52)
  if (!date || !start_time || !end_time)
    return res.status(400).json({ message: 'date, start_time, end_time are required.' })

  const clubId = req.club?.id ?? 1
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

    for (const d of dates) {
      const scheduleError = await checkOpenHours(d, start_time, end_time, clubId)
      if (scheduleError) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: `${d}: ${scheduleError}` })
      }
      const availError = await checkCourtsAvailable(d, start_time, end_time, null, courts, clubId)
      if (availError) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: `${d}: ${availError}` })
      }
    }

    const insertedIds = []
    for (const d of dates) {
      const { rows } = await client.query(
        `INSERT INTO social_play_sessions
           (title, description, num_courts, date, start_time, end_time, max_players, created_by, recurrence_id, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          title || 'Social Play', description || null,
          courts, d, start_time, end_time,
          max_players || 12, req.user.id, recurrenceId, clubId,
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

// PATCH /api/social/:id
router.patch('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })

  const clubId = req.club?.id ?? 1
  try {
    const { num_courts, start_time, end_time, title, max_players, date } = req.body
    const updates = []
    const values  = []

    const { rows: cur } = await pool.query(
      `SELECT s.date, s.start_time, s.end_time, s.num_courts,
              (SELECT COUNT(*)::int FROM social_play_participants pp JOIN users uu ON uu.id = pp.user_id WHERE pp.session_id = s.id AND NOT uu.is_walkin) AS online_count
       FROM social_play_sessions s
       WHERE s.id=$1 AND s.club_id=$2`,
      [req.params.id, clubId]
    )
    if (!cur[0]) return res.status(404).json({ message: 'Session not found.' })
    const sess = cur[0]

    if (max_players !== undefined && Number(max_players) < sess.online_count)
      return res.status(409).json({ message: `Cannot set max players below current online reservations (${sess.online_count}).` })

    const toM = t => { const [h, m] = t.substring(0, 5).split(':').map(Number); return h * 60 + m }

    const finalCourts = num_courts !== undefined ? Math.min(Math.max(Number(num_courts), 1), 6) : sess.num_courts
    const finalStart  = start_time !== undefined ? start_time : sess.start_time.substring(0, 5)
    const finalEnd    = end_time   !== undefined ? end_time   : sess.end_time.substring(0, 5)
    const finalDate   = date       !== undefined ? date       : sess.date

    const courtsIncreasing = finalCourts > sess.num_courts
    const timeExpanding    = toM(finalStart) < toM(sess.start_time.substring(0, 5)) ||
                             toM(finalEnd)   > toM(sess.end_time.substring(0, 5))
    const dateChanging     = date !== undefined && date !== sess.date

    if (courtsIncreasing || timeExpanding || dateChanging) {
      const availError = await checkCourtsAvailable(
        finalDate, finalStart, finalEnd, Number(req.params.id), finalCourts, clubId
      )
      if (availError) return res.status(409).json({ message: availError })
    }

    if (num_courts !== undefined) { updates.push(`num_courts=$${values.length + 1}`); values.push(finalCourts) }
    if (start_time !== undefined) { updates.push(`start_time=$${values.length + 1}`); values.push(start_time) }
    if (end_time   !== undefined) { updates.push(`end_time=$${values.length + 1}`);   values.push(end_time) }
    if (title      !== undefined) { updates.push(`title=$${values.length + 1}`);      values.push(String(title).trim() || 'Social Play') }
    if (max_players !== undefined) { updates.push(`max_players=$${values.length + 1}`); values.push(Math.max(1, Number(max_players))) }
    if (date       !== undefined) { updates.push(`date=$${values.length + 1}`);       values.push(date) }
    if (updates.length === 0)
      return res.status(400).json({ message: 'Nothing to update.' })

    values.push(req.params.id)
    values.push(clubId)
    const { rows } = await pool.query(
      `UPDATE social_play_sessions SET ${updates.join(', ')}
       WHERE id=$${values.length - 1} AND club_id=$${values.length} RETURNING *`,
      values
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    res.json({ session: rows[0] })
  } catch (err) { res.status(500).json({ message: err.message ?? 'Server error.' }) }
})

// DELETE /api/social/recurrence/:recurrenceId
router.delete('/recurrence/:recurrenceId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const clubId = req.club?.id ?? 1
    const { rowCount } = await pool.query(
      `DELETE FROM social_play_sessions WHERE recurrence_id=$1 AND date >= CURRENT_DATE AND club_id=$2`,
      [req.params.recurrenceId, clubId]
    )
    res.json({ message: `Cancelled ${rowCount} session(s).`, count: rowCount })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/social/batch  — cancel specific session IDs (admin)
router.delete('/batch', requireAuth, requireAdmin, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const { ids } = req.body
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ message: 'ids array is required.' })
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM social_play_sessions WHERE id = ANY($1::int[]) AND club_id=$2`,
      [ids, clubId]
    )
    res.json({ count: rowCount })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/social/:id
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  try {
    const clubId = req.club?.id ?? 1
    const { rows } = await pool.query(
      'SELECT id FROM social_play_sessions WHERE id=$1 AND club_id=$2',
      [req.params.id, clubId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found.' })
    await pool.query('DELETE FROM social_play_sessions WHERE id=$1', [req.params.id])
    res.json({ message: 'Session deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/social/:id/join
router.post('/:id/join', requireAuth, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT id, date, start_time, end_time, max_players,
         (SELECT COUNT(*)::int FROM social_play_participants pp
          JOIN users uu ON uu.id = pp.user_id
          WHERE pp.session_id=$1 AND NOT uu.is_walkin) AS online_count
       FROM social_play_sessions
       WHERE id=$1 AND status='open' AND club_id=$2
       FOR UPDATE`,
      [req.params.id, clubId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found or not open.' })
    if (rows[0].online_count >= rows[0].max_players)
      return res.status(409).json({ message: 'Session is full.' })

    const { date, start_time, end_time } = rows[0]

    const { rows: bookConflict } = await client.query(
      `SELECT 1 FROM bookings
       WHERE user_id=$1 AND date=$2 AND status='confirmed' AND club_id=$5
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time, clubId]
    )
    if (bookConflict.length)
      return res.status(409).json({ message: 'You have a court booking during that time.' })

    const { rows: coachConflict } = await client.query(
      `SELECT 1 FROM coaching_sessions
       WHERE student_id=$1 AND date=$2 AND status='confirmed' AND club_id=$5
         AND start_time < $4::time AND end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time, clubId]
    )
    if (coachConflict.length)
      return res.status(409).json({ message: 'You have a coaching session during that time.' })

    const { rows: socialConflict } = await client.query(
      `SELECT 1 FROM social_play_sessions sps
       JOIN social_play_participants spp ON spp.session_id = sps.id
       WHERE spp.user_id=$1 AND sps.date=$2 AND sps.status='open' AND sps.club_id=$6
         AND sps.start_time < $4::time AND sps.end_time > $3::time
         AND sps.id != $5 LIMIT 1`,
      [req.user.id, date, start_time, end_time, req.params.id, clubId]
    )
    if (socialConflict.length)
      return res.status(409).json({ message: 'You are already signed up for another social play session during that time.' })

    const { rows: coachTeachConflict } = await client.query(
      `SELECT 1 FROM coaching_sessions cs
       JOIN coaches co ON co.id = cs.coach_id
       WHERE co.user_id=$1 AND cs.date=$2 AND cs.status='confirmed' AND cs.club_id=$5
         AND cs.start_time < $4::time AND cs.end_time > $3::time LIMIT 1`,
      [req.user.id, date, start_time, end_time, clubId]
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

// DELETE /api/social/:id/join
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

// POST /api/social/:id/participants  (admin)
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
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Session not found.' }) }
    if (rows[0].count >= rows[0].max_players) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Session is full.' }) }
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

// POST /api/social/:id/walkin  (admin)
router.post('/:id/walkin', requireAuth, requireAdmin, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: session } = await client.query(
      `SELECT id, max_players,
         (SELECT COUNT(*)::int FROM social_play_participants WHERE session_id=$1) AS count
       FROM social_play_sessions WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    )
    if (!session[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Session not found.' }) }
    if (session[0].count >= session[0].max_players) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Session is full.' }) }
    const { rows: available } = await client.query(
      `SELECT id, name FROM users
       WHERE is_walkin = true AND club_id = $2
         AND id NOT IN (SELECT user_id FROM social_play_participants WHERE session_id=$1)
       ORDER BY name LIMIT 1`,
      [req.params.id, clubId]
    )
    if (!available[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'All walk-in slots are already in this session.' }) }
    await client.query('INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)', [req.params.id, available[0].id])
    await client.query('COMMIT')
    res.status(201).json({ message: 'Walk-in added.', user: { id: available[0].id, name: available[0].name } })
  } catch { await client.query('ROLLBACK'); res.status(500).json({ message: 'Server error.' }) }
  finally { client.release() }
})

// DELETE /api/social/:id/participants/:userId  (admin)
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
