const router = require('express').Router()
const pool   = require('../db')

router.get('/', async (req, res) => {
  try {
    const clubId = req.club?.id ?? 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const { rows } = await pool.query(
      'SELECT * FROM announcements WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2',
      [clubId, limit]
    )
    res.json({ announcements: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
