// ─── Super Admin Routes ───────────────────────────────────────────────────────
// All endpoints require the X-Super-Admin-Key header.
//
// GET  /api/super-admin/clubs          → list all clubs
// POST /api/super-admin/clubs          → create new club (bootstraps courts, schedule, etc.)
// PATCH /api/super-admin/clubs/:id     → update club name / settings / subdomain
// DELETE /api/super-admin/clubs/:id    → deactivate club (soft delete)
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router()
const pool   = require('../db')
const bcrypt = require('bcryptjs')
const { requireSuperAdmin } = require('../middleware/superAdmin')
const { bustClubCache } = require('../middleware/tenant')

router.use(requireSuperAdmin)

// ─── GET /api/super-admin/clubs ───────────────────────────────────────────────
router.get('/clubs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, subdomain, settings, is_active, created_at
       FROM clubs ORDER BY id ASC`
    )
    res.json({ clubs: rows })
  } catch (err) {
    console.error('[super-admin] list clubs error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ─── POST /api/super-admin/clubs ─────────────────────────────────────────────
// Bootstraps a full club in a single transaction:
//   clubs row + 6 courts + weekly schedule + walkin user + coaching prices + admin user
router.post('/clubs', async (req, res) => {
  const {
    name,
    subdomain,
    settings = {},
    admin_name,
    admin_email,
    admin_password,
    num_courts = 6,
  } = req.body

  if (!name || !subdomain || !admin_email || !admin_password)
    return res.status(400).json({ message: 'name, subdomain, admin_email and admin_password are required.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Create the club
    const { rows: [club] } = await client.query(
      `INSERT INTO clubs (name, subdomain, settings)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, subdomain, settings]
    )
    const clubId = club.id

    // 2. Create courts (1 … num_courts)
    for (let i = 1; i <= num_courts; i++) {
      await client.query(
        `INSERT INTO courts (name, club_id) VALUES ($1, $2)`,
        [`Court ${i}`, clubId]
      )
    }

    // 3. Create default weekly schedule
    const defaultSchedule = [
      { day: 'Mon', start: '16:00', end: '20:30' },
      { day: 'Tue', start: '16:00', end: '20:30' },
      { day: 'Wed', start: '16:00', end: '20:30' },
      { day: 'Sat', start: '13:00', end: '18:30' },
    ]
    for (const s of defaultSchedule) {
      await client.query(
        `INSERT INTO schedule (day, start_time, end_time, is_active, club_id)
         VALUES ($1, $2, $3, TRUE, $4)`,
        [s.day, s.start, s.end, clubId]
      )
    }

    // 4. Create walk-in placeholder user
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_walkin, club_id)
       VALUES ($1, $2, 'walkin', 'member', TRUE, $3)`,
      [`${name} Walk-in`, `walkin@${subdomain}.internal`, clubId]
    )

    // 5. Create coaching prices
    await client.query(
      `INSERT INTO coaching_prices (session_type, price, club_id) VALUES
       ('solo',  70, $1),
       ('group', 50, $1)`,
      [clubId]
    )

    // 6. Create admin user
    const hash = await bcrypt.hash(admin_password, 10)
    const { rows: [adminUser] } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, club_id)
       VALUES ($1, $2, $3, 'admin', $4) RETURNING id`,
      [admin_name || name + ' Admin', admin_email, hash, clubId]
    )

    await client.query('COMMIT')

    res.status(201).json({
      message: 'Club created.',
      club: {
        id:       clubId,
        name:     club.name,
        subdomain: club.subdomain,
      },
      admin_user_id: adminUser.id,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[super-admin] create club error:', err.message)
    if (err.code === '23505')
      return res.status(409).json({ message: 'Subdomain or admin email already in use.' })
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
  }
})

// ─── PATCH /api/super-admin/clubs/:id ────────────────────────────────────────
router.patch('/clubs/:id', async (req, res) => {
  const allowed = ['name', 'subdomain', 'settings', 'is_active']
  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  }
  if (!Object.keys(updates).length)
    return res.status(400).json({ message: 'Nothing to update.' })

  try {
    // Get current subdomain so we can bust cache
    const { rows: [current] } = await pool.query(
      'SELECT subdomain FROM clubs WHERE id=$1', [req.params.id]
    )
    if (!current) return res.status(404).json({ message: 'Club not found.' })

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`)
    const values     = [req.params.id, ...Object.values(updates)]

    const { rows: [club] } = await pool.query(
      `UPDATE clubs SET ${setClauses.join(', ')} WHERE id=$1
       RETURNING id, name, subdomain, settings, is_active`,
      values
    )

    bustClubCache(current.subdomain)
    if (club.subdomain !== current.subdomain) bustClubCache(club.subdomain)

    res.json({ club })
  } catch (err) {
    console.error('[super-admin] update club error:', err.message)
    if (err.code === '23505')
      return res.status(409).json({ message: 'Subdomain already in use.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// ─── DELETE /api/super-admin/clubs/:id ───────────────────────────────────────
router.delete('/clubs/:id', async (req, res) => {
  try {
    const { rows: [club] } = await pool.query(
      `UPDATE clubs SET is_active = FALSE WHERE id=$1
       RETURNING id, subdomain`,
      [req.params.id]
    )
    if (!club) return res.status(404).json({ message: 'Club not found.' })
    bustClubCache(club.subdomain)
    res.json({ message: 'Club deactivated.' })
  } catch (err) {
    console.error('[super-admin] delete club error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
