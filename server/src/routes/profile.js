const router = require('express').Router()
const bcrypt = require('bcryptjs')
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

const safeUser = (u) => ({
  id: u.id, name: u.name, email: u.email,
  role: u.role, phone: u.phone, avatar_url: u.avatar_url,
})

// GET /api/profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])
    if (!rows[0]) return res.status(404).json({ message: 'Not found.' })
    res.json({ user: safeUser(rows[0]) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PUT /api/profile
router.put('/', requireAuth, async (req, res) => {
  const { name, phone } = req.body
  try {
    const { rows } = await pool.query(
      'UPDATE users SET name=$1, phone=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [name, phone || null, req.user.id]
    )
    res.json({ user: safeUser(rows[0]) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/profile/password
router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: 'Both passwords are required.' })

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])
    const user = rows[0]
    if (!user.password_hash)
      return res.status(400).json({ message: 'OAuth accounts cannot set a password here.' })

    const ok = await bcrypt.compare(currentPassword, user.password_hash)
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' })

    const hash = await bcrypt.hash(newPassword, 12)
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user.id])
    res.json({ message: 'Password updated.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
