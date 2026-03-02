const router   = require('express').Router()
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const passport = require('../config/passport')
const pool     = require('../db')

const sign = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

const safeUser = (u) => ({
  id: u.id, name: u.name, email: u.email,
  role: u.role, phone: u.phone, avatar_url: u.avatar_url,
})

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email and password are required.' })

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email])
    if (exists.rows[0])
      return res.status(409).json({ message: 'An account with that email already exists.' })

    const hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, email, hash, phone || null]
    )
    const user = rows[0]
    res.status(201).json({ token: sign(user), user: safeUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/auth/login
// `identifier` accepts either an email address or a phone number
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body
  if (!identifier || !password)
    return res.status(400).json({ message: 'Email/phone and password are required.' })

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email=$1 OR phone=$1',
      [identifier]
    )
    const user = rows[0]
    if (!user || !user.password_hash)
      return res.status(401).json({ message: 'Invalid email/phone or password.' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ message: 'Invalid email/phone or password.' })

    res.json({ token: sign(user), user: safeUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/auth/logout  (client just discards token; endpoint for symmetry)
router.post('/logout', (req, res) => {
  req.logout?.(() => {})
  res.json({ message: 'Logged out.' })
})

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])
    if (!rows[0]) return res.status(404).json({ message: 'User not found.' })
    res.json({ user: safeUser(rows[0]) })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── Google OAuth ─────────────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`, session: false }),
  (req, res) => {
    const token = sign(req.user)
    const user  = encodeURIComponent(JSON.stringify(safeUser(req.user)))
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&user=${user}`)
  }
)

module.exports = router
