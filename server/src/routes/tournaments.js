const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/tournaments
router.get('/', async (req, res) => {
  try {
    const clubId = req.club?.id ?? 1
    const { rows } = await pool.query(
      `SELECT t.*,
         COUNT(tr.id)::int AS participants
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id=t.id
       WHERE t.club_id=$1
       GROUP BY t.id ORDER BY t.date DESC`,
      [clubId]
    )
    res.json({ tournaments: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/tournaments/:id
router.get('/:id', async (req, res) => {
  try {
    const clubId = req.club?.id ?? 1
    const { rows } = await pool.query(
      `SELECT t.*, COUNT(tr.id)::int AS participants
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id=t.id
       WHERE t.id=$1 AND t.club_id=$2 GROUP BY t.id`,
      [req.params.id, clubId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Tournament not found.' })
    res.json({ tournament: rows[0] })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/tournaments/:id/register
router.post('/:id/register', requireAuth, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT t.max_participants, COUNT(tr.id)::int AS registered
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
       WHERE t.id = $1 AND t.club_id = $2
       GROUP BY t.id`,
      [req.params.id, clubId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Tournament not found.' })
    if (rows[0].max_participants && rows[0].registered >= rows[0].max_participants)
      return res.status(409).json({ message: 'Tournament is full.' })

    await client.query(
      'INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1,$2)',
      [req.params.id, req.user.id]
    )
    await client.query('COMMIT')
    res.status(201).json({ message: 'Registered.' })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505')
      return res.status(409).json({ message: 'Already registered.' })
    res.status(500).json({ message: 'Server error.' })
  } finally {
    client.release()
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
