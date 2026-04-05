const router = require('express').Router()
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/messages/unread-count
// Returns count of unread messages for the logged-in user
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS count FROM messages m
      WHERE (m.recipient_id = $1 OR m.recipient_id IS NULL)
        AND m.sender_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr
          WHERE mr.message_id = m.id AND mr.user_id = $1
        )
    `, [req.user.id])
    res.json({ count: Number(rows[0].count) })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/messages/inbox
// Returns conversation list for the logged-in user
router.get('/inbox', requireAuth, async (req, res) => {
  const uid = req.user.id
  try {
    // Announcements (recipient_id IS NULL, sent by admin)
    const { rows: announcements } = await pool.query(`
      SELECT m.id, m.body, m.created_at, m.recipient_id,
             u.name AS sender_name, u.id AS sender_id,
             EXISTS(
               SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $1
             ) AS is_read
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.recipient_id IS NULL
      ORDER BY m.created_at DESC
    `, [uid])

    // Direct messages involving this user
    // For each "other person", show the latest message
    const { rows: threads } = await pool.query(`
      SELECT DISTINCT ON (other_user)
        CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS other_user,
        m.id, m.body, m.created_at, m.sender_id, m.recipient_id,
        u.name AS other_name,
        EXISTS(
          SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $1
        ) AS is_read
      FROM messages m
      JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
      WHERE m.recipient_id IS NOT NULL
        AND (m.sender_id = $1 OR m.recipient_id = $1)
      ORDER BY other_user, m.created_at DESC
    `, [uid])

    res.json({ announcements, threads })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/messages/thread/:userId
// Returns full conversation between logged-in user and userId
router.get('/thread/:userId', requireAuth, async (req, res) => {
  const uid   = req.user.id
  const other = Number(req.params.userId)
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.body, m.created_at, m.sender_id, m.recipient_id,
             u.name AS sender_name,
             EXISTS(
               SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $1
             ) AS is_read
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
    `, [uid, other])

    // Mark all unread messages in this thread as read
    await pool.query(`
      INSERT INTO message_reads (message_id, user_id)
      SELECT m.id, $1 FROM messages m
      WHERE (m.sender_id = $2 AND m.recipient_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $1
        )
      ON CONFLICT DO NOTHING
    `, [uid, other])

    res.json({ messages: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/messages
// Send a message. recipient_id=null means broadcast (admin only).
router.post('/', requireAuth, async (req, res) => {
  const { recipient_id, body } = req.body
  if (!body?.trim()) return res.status(400).json({ message: 'Message body is required.' })

  // Broadcast: admin only
  if (!recipient_id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Only admins can send announcements.' })

  // Members can only message admins
  if (recipient_id && req.user.role !== 'admin') {
    const { rows } = await pool.query('SELECT role FROM users WHERE id=$1', [recipient_id])
    if (!rows[0] || rows[0].role !== 'admin')
      return res.status(403).json({ message: 'Members can only message admins.' })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, body)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, recipient_id ?? null, body.trim()]
    )
    // Auto-mark as read by sender
    await pool.query(
      'INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rows[0].id, req.user.id]
    )
    res.json({ message: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/messages/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    )
    res.json({ ok: true })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
