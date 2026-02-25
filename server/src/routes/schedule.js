const router = require('express').Router()
const pool   = require('../db')

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM schedule WHERE is_active=TRUE ORDER BY id"
    )
    res.json({ schedule: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
