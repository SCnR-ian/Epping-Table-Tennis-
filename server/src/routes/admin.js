const router  = require('express').Router()
const pool    = require('../db')
const bcrypt  = require('bcryptjs')
const multer  = require('multer')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are allowed.'))
  },
})

router.use(requireAuth, requireAdmin)

const safeUser = (u) => ({
  id: u.id, name: u.name, email: u.email,
  role: u.role, phone: u.phone, avatar_url: u.avatar_url, created_at: u.created_at,
})

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [members, bookings, tournaments] = await Promise.all([
      pool.query("SELECT COUNT(*)::int FROM users WHERE role='member'"),
      pool.query("SELECT COUNT(*)::int FROM bookings WHERE status='confirmed'"),
      pool.query("SELECT COUNT(*)::int FROM tournaments"),
    ])
    res.json({
      members:     members.rows[0].count,
      bookings:    bookings.rows[0].count,
      tournaments: tournaments.rows[0].count,
    })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/admin/members — admin creates a member account
router.post('/members', async (req, res) => {
  const { name, email, password, phone } = req.body
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ message: 'Name, email and password are required.' })
  try {
    const hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING *',
      [name.trim(), email.toLowerCase().trim(), hash, phone?.trim() || null]
    )
    res.status(201).json({ member: safeUser(rows[0]) })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'An account with that email already exists.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/admin/members
router.get('/members', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE is_walkin IS NOT TRUE ORDER BY created_at DESC')
    res.json({ members: rows.map(safeUser) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PUT /api/admin/members/:id/role
router.put('/members/:id/role', async (req, res) => {
  const { role } = req.body
  if (!['member', 'admin', 'coach'].includes(role))
    return res.status(400).json({ message: 'Invalid role.' })
  const client = await pool.connect()
  try {
    // Block demotion if the coach has future confirmed sessions
    if (role !== 'coach') {
      const { rows: futureSessions } = await client.query(
        `SELECT COUNT(*)::int AS count FROM coaching_sessions cs
         JOIN coaches co ON co.id = cs.coach_id
         WHERE co.user_id = $1 AND cs.status = 'confirmed' AND cs.date >= CURRENT_DATE`,
        [req.params.id]
      )
      if (futureSessions[0].count > 0)
        return res.status(409).json({
          message: `Cannot demote: this coach has ${futureSessions[0].count} upcoming session${futureSessions[0].count > 1 ? 's' : ''}. Cancel or reassign them first.`
        })
    }
    const { rows } = await client.query(
      'UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [role, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Member not found.' })
    if (role !== 'coach') {
      try { await client.query('DELETE FROM coaches WHERE user_id=$1', [req.params.id]) } catch {}
    }
    res.json({ member: safeUser(rows[0]) })
  } catch (err) { res.status(500).json({ message: err.message ?? 'Server error.' }) }
  finally { client.release() }
})

// POST /api/admin/members/:id/make-coach  (multipart/form-data)
router.post('/members/:id/make-coach', upload.single('resume'), async (req, res) => {
  const availability_start = req.body.availability_start || null
  const availability_end   = req.body.availability_end   || null
  const bio                = req.body.bio                || null
  const userId = req.params.id
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userRes = await client.query('SELECT * FROM users WHERE id=$1', [userId])
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Member not found.' }) }
    const userName = userRes.rows[0].name
    const resumeFilename = req.file ? req.file.originalname : null
    const resumeData     = req.file ? req.file.buffer.toString('base64') : null
    const { rows } = await client.query(
      `INSERT INTO coaches (user_id, name, bio, availability_start, availability_end, resume_filename, resume_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
         bio=$3, availability_start=$4, availability_end=$5,
         resume_filename=COALESCE($6, coaches.resume_filename),
         resume_data=COALESCE($7, coaches.resume_data)
       RETURNING *`,
      [userId, userName, bio, availability_start, availability_end, resumeFilename, resumeData]
    )
    await client.query("UPDATE users SET role='coach', updated_at=NOW() WHERE id=$1", [userId])
    await client.query('COMMIT')
    res.status(201).json({ coach: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('make-coach error:', err.message, err.stack)
    res.status(500).json({ message: err.message })
  } finally { client.release() }
})

// GET /api/admin/coaches/:id/resume
router.get('/coaches/:id/resume', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT resume_filename, resume_data FROM coaches WHERE id=$1', [req.params.id])
    if (!rows[0] || !rows[0].resume_data) return res.status(404).json({ message: 'No resume found.' })
    const buf = Buffer.from(rows[0].resume_data, 'base64')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].resume_filename || 'resume.pdf'}"`)
    res.send(buf)
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/admin/members/:id
router.delete('/members/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ message: 'You cannot delete your own account.' })
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id=$1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ message: 'Member not found.' })
    res.json({ message: 'Member deleted.' })
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: 'Cannot delete member: they have linked records. Run the FK migration first.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/admin/members/:userId/activities
router.get('/members/:userId/activities', async (req, res) => {
  const { userId } = req.params
  try {
    const userRes = await pool.query(
      'SELECT id,name,email,role,phone,avatar_url,created_at FROM users WHERE id=$1',
      [userId]
    )
    if (!userRes.rows[0]) return res.status(404).json({ message: 'Member not found.' })

    const [bookingsRes, coachingRes, socialRes, hoursRes, coachSessionsRes] = await Promise.allSettled([
      pool.query(
        `SELECT b.booking_group_id, b.court_id,
                b.date, MIN(b.start_time) AS start_time, MAX(b.end_time) AS end_time, b.status
         FROM bookings b
         WHERE b.user_id=$1 AND b.status='confirmed'
         GROUP BY b.booking_group_id, b.court_id, b.date, b.status
         ORDER BY b.date DESC, MIN(b.start_time) ASC
         LIMIT 50`,
        [userId]
      ),
      pool.query(
        `SELECT cs.id, cs.coach_id, cs.student_id, cs.date, cs.start_time, cs.end_time, cs.notes,
                cs.recurrence_id, cs.group_id, cs.status,
                co.name AS coach_name,
                EXISTS(
                  SELECT 1 FROM check_ins ci
                  WHERE ci.type='coaching' AND ci.reference_id=cs.id::text AND ci.user_id=cs.student_id
                ) AS checked_in
         FROM coaching_sessions cs
         JOIN coaches co ON co.id = cs.coach_id
         WHERE cs.student_id=$1 AND cs.status='confirmed'
         ORDER BY cs.date DESC, cs.start_time ASC
         LIMIT 50`,
        [userId]
      ),
      pool.query(
        `SELECT sps.id, sps.date, sps.start_time, sps.end_time,
                sps.status, sps.num_courts, sps.title
         FROM social_play_sessions sps
         JOIN social_play_participants spp ON spp.session_id = sps.id
         WHERE spp.user_id=$1 AND sps.status != 'cancelled'
         ORDER BY sps.date DESC, sps.start_time ASC
         LIMIT 50`,
        [userId]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN session_type='solo'  THEN delta ELSE 0 END),0)::numeric AS solo_balance,
           COALESCE(SUM(CASE WHEN session_type='group' THEN delta ELSE 0 END),0)::numeric AS group_balance
         FROM coaching_hour_ledger WHERE user_id=$1`,
        [userId]
      ),
      // Sessions this user coaches (only if they have a coaches record)
      pool.query(
        `SELECT cs.id, cs.date, cs.start_time, cs.end_time, cs.notes, cs.group_id,
                u.id AS student_id, u.name AS student_name,
                EXISTS(
                  SELECT 1 FROM check_ins ci
                  WHERE ci.type='coaching' AND ci.reference_id=cs.id::text AND ci.user_id=u.id
                ) AS checked_in
         FROM coaching_sessions cs
         JOIN users u ON u.id = cs.student_id
         WHERE cs.coach_id = (SELECT id FROM coaches WHERE user_id=$1 LIMIT 1)
           AND cs.status='confirmed'
         ORDER BY cs.date DESC, cs.start_time ASC
         LIMIT 100`,
        [userId]
      ),
    ])

    res.json({
      member:        userRes.rows[0],
      bookings:      bookingsRes.status       === 'fulfilled' ? bookingsRes.value.rows       : [],
      coaching:      coachingRes.status       === 'fulfilled' ? coachingRes.value.rows       : [],
      social:        socialRes.status         === 'fulfilled' ? socialRes.value.rows         : [],
      coachSessions: coachSessionsRes.status  === 'fulfilled' ? coachSessionsRes.value.rows  : [],
      soloBalance:   hoursRes.status === 'fulfilled' ? Math.round(parseFloat(hoursRes.value.rows[0].solo_balance)  * 100) / 100 : 0,
      groupBalance:  hoursRes.status === 'fulfilled' ? Math.round(parseFloat(hoursRes.value.rows[0].group_balance) * 100) / 100 : 0,
    })
  } catch (err) {
    console.error('member activities error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/admin/bookings?date=YYYY-MM-DD
// Returns one row per booking session (grouped by booking_group_id),
// with the full time span (min start → max end) so each session appears
// as a single block in the admin calendar view.
router.get('/bookings', async (req, res) => {
  const { date } = req.query
  try {
    const { rows } = await pool.query(
      `SELECT
         b.booking_group_id,
         b.court_id,
         b.date,
         b.user_id,
         MIN(b.start_time) AS start_time,
         MAX(b.end_time)   AS end_time,
         b.status,
         u.name  AS user_name,
         u.email AS user_email,
         c.name  AS court_name
       FROM bookings b
       JOIN users u ON u.id  = b.user_id
       JOIN courts c ON c.id = b.court_id
       WHERE b.status = 'confirmed' ${date ? 'AND b.date = $1' : ''}
       GROUP BY b.booking_group_id, b.court_id, b.date, b.user_id, b.status, u.name, u.email, c.name
       ORDER BY b.date DESC, MIN(b.start_time) DESC`,
      date ? [date] : []
    )
    res.json({ bookings: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/admin/tournaments
router.post('/tournaments', async (req, res) => {
  const { name, date, prize, status, max_participants, format } = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO tournaments (name, date, prize, status, max_participants, format)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, date, prize, status || 'upcoming', max_participants || 32, format || 'Singles']
    )
    res.status(201).json({ tournament: rows[0] })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PUT /api/admin/tournaments/:id
router.put('/tournaments/:id', async (req, res) => {
  const { name, date, prize, status, max_participants, format } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE tournaments SET name=$1, date=$2, prize=$3, status=$4,
       max_participants=$5, format=$6 WHERE id=$7 RETURNING *`,
      [name, date, prize, status, max_participants, format, req.params.id]
    )
    res.json({ tournament: rows[0] })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/admin/tournaments/:id
router.delete('/tournaments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tournaments WHERE id=$1', [req.params.id])
    res.json({ message: 'Tournament deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
