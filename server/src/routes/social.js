const router = require('express').Router()
const pool   = require('../db')
const jwt    = require('jsonwebtoken')
const { requireAuth } = require('../middleware/auth')

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
  s.max_players, s.num_courts, s.status, s.created_at,
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

// POST /api/social — admin creates a session
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })

  const { title, description, num_courts, date, start_time, end_time, max_players } = req.body
  const courts = Math.min(Math.max(Number(num_courts) || 1, 1), 6)
  if (!date || !start_time || !end_time)
    return res.status(400).json({ message: 'date, start_time, end_time are required.' })

  try {
    const { rows } = await pool.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        title || 'Social Play',
        description || null,
        courts, date, start_time, end_time,
        max_players || 12,
        req.user.id,
      ]
    )
    const { rows: full } = await pool.query(
      `SELECT ${SESSION_COLS}
       FROM social_play_sessions s
       LEFT JOIN social_play_participants p ON p.session_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [rows[0].id]
    )
    res.status(201).json({
      session: { ...full[0], participant_count: 0, participants: [], joined: false },
    })
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
      `SELECT id, max_players,
         (SELECT COUNT(*)::int FROM social_play_participants WHERE session_id=$1) AS count
       FROM social_play_sessions
       WHERE id=$1 AND status='open'
       FOR UPDATE`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Session not found or not open.' })
    if (rows[0].count >= rows[0].max_players)
      return res.status(409).json({ message: 'Session is full.' })

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

module.exports = router
