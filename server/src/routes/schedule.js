const router = require('express').Router()
const pool   = require('../db')

router.get('/', async (req, res) => {
  try {
    const clubId = req.club?.id ?? 1
    const { rows } = await pool.query(
      'SELECT * FROM schedule WHERE is_active=TRUE AND club_id=$1 ORDER BY id',
      [clubId]
    )
    res.json({ schedule: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
