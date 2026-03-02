const router = require('express').Router()
const pool   = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

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

// GET /api/admin/members
router.get('/members', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC')
    res.json({ members: rows.map(safeUser) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PUT /api/admin/members/:id/role
router.put('/members/:id/role', async (req, res) => {
  const { role } = req.body
  if (!['member', 'admin'].includes(role))
    return res.status(400).json({ message: 'Invalid role.' })
  try {
    const { rows } = await pool.query(
      'UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [role, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Member not found.' })
    res.json({ member: safeUser(rows[0]) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/admin/members/:id
router.delete('/members/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ message: 'You cannot delete your own account.' })
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id])
    res.json({ message: 'Member deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/admin/bookings?date=YYYY-MM-DD
router.get('/bookings', async (req, res) => {
  const { date } = req.query
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS user_name, u.email AS user_email, c.name AS court_name
       FROM bookings b
       JOIN users u ON u.id=b.user_id
       JOIN courts c ON c.id=b.court_id
       WHERE b.status='confirmed' ${date ? 'AND b.date = $1' : ''}
       ORDER BY b.date DESC, b.start_time DESC`,
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
