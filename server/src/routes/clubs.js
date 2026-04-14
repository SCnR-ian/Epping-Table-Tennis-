// ─── Clubs Route ──────────────────────────────────────────────────────────────
// GET  /api/clubs/current  → returns current club info (name, subdomain, settings)
// PATCH /api/clubs/current → admin only: update name / settings
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')
const { bustClubCache } = require('../middleware/tenant')

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only.' })
  next()
}

// GET /api/clubs/current
router.get('/current', (req, res) => {
  if (!req.club) return res.status(404).json({ message: 'Club not found.' })
  const { id, name, subdomain, settings } = req.club
  res.json({ id, name, subdomain, settings })
})

// PATCH /api/clubs/current
router.patch('/current', requireAuth, requireAdmin, async (req, res) => {
  if (!req.club) return res.status(404).json({ message: 'Club not found.' })

  const allowed = ['name', 'settings']
  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  }
  if (!Object.keys(updates).length)
    return res.status(400).json({ message: 'Nothing to update.' })

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`)
    const values     = [req.club.id, ...Object.values(updates)]

    const { rows } = await pool.query(
      `UPDATE clubs SET ${setClauses.join(', ')} WHERE id=$1 RETURNING id, name, subdomain, settings`,
      values
    )
    if (!rows[0]) return res.status(404).json({ message: 'Club not found.' })

    // Bust the tenant cache so the next request picks up the new values
    bustClubCache(rows[0].subdomain)

    res.json({ club: rows[0] })
  } catch (err) {
    console.error('[clubs] patch error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
