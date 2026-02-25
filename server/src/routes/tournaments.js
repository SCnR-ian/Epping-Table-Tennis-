const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/tournaments
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*,
         COUNT(tr.id)::int AS participants
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id=t.id
       GROUP BY t.id ORDER BY t.date DESC`
    )
    res.json({ tournaments: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/tournaments/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, COUNT(tr.id)::int AS participants
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id=t.id
       WHERE t.id=$1 GROUP BY t.id`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Tournament not found.' })
    res.json({ tournament: rows[0] })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/tournaments/:id/register
router.post('/:id/register', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1,$2)',
      [req.params.id, req.user.id]
    )
    res.status(201).json({ message: 'Registered.' })
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ message: 'Already registered.' })
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/tournaments/:id/register
router.delete('/:id/register', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM tournament_registrations WHERE tournament_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    )
    res.json({ message: 'Withdrawn.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
