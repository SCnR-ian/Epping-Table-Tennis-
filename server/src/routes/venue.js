const router = require('express').Router()
const crypto = require('crypto')
const pool   = require('../db')
const { requireAuth } = require('../middleware/auth')

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getClubAdmin(clubId) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role='admin' AND club_id=$1 LIMIT 1`,
    [clubId]
  )
  return rows[0]?.id ?? null
}

async function sendMsg(senderId, recipientId, body) {
  try {
    const { rows: [msg] } = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id`,
      [senderId, recipientId, body]
    )
    await pool.query(
      `INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [msg.id, senderId]
    )
  } catch (e) {
    console.error('[venue sendMsg] failed:', e.message)
  }
}

function fmtDateTime(dt) {
  return new Date(dt).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function durationStr(ms) {
  const totalMins = Math.round(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/venue/status  — today's check-in status for current user
router.get('/status', requireAuth, async (req, res) => {
  const clubId = req.club?.id ?? 1
  try {
    const { rows } = await pool.query(
      `SELECT checked_in_at, checked_out_at FROM venue_checkins
       WHERE user_id=$1 AND club_id=$2 AND date=CURRENT_DATE`,
      [req.user.id, clubId]
    )
    const row = rows[0]
    res.json({
      checked_in:     !!row,
      checked_out:    !!(row?.checked_out_at),
      checked_in_at:  row?.checked_in_at  ?? null,
      checked_out_at: row?.checked_out_at ?? null,
    })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/venue/checkin
router.post('/checkin', requireAuth, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const { token } = req.body
  try {
    const { rows: [club] } = await pool.query(
      'SELECT qr_token FROM clubs WHERE id=$1', [clubId]
    )
    if (!club || club.qr_token !== token)
      return res.status(403).json({ message: 'Invalid QR code.' })

    const { rows } = await pool.query(
      `SELECT id FROM venue_checkins
       WHERE user_id=$1 AND club_id=$2 AND date=CURRENT_DATE`,
      [req.user.id, clubId]
    )
    if (rows[0])
      return res.status(409).json({ message: 'Already checked in today.' })

    const now = new Date()
    await pool.query(
      `INSERT INTO venue_checkins (user_id, club_id, checked_in_at) VALUES ($1, $2, $3)`,
      [req.user.id, clubId, now]
    )
    const adminId = await getClubAdmin(clubId)
    if (adminId) {
      await sendMsg(adminId, req.user.id, `✅ Signed in — ${fmtDateTime(now)}`)
    }
    res.json({ message: 'Checked in.', checked_in_at: now })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/venue/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const clubId = req.club?.id ?? 1
  const { token } = req.body
  try {
    const { rows: [club] } = await pool.query(
      'SELECT qr_token FROM clubs WHERE id=$1', [clubId]
    )
    if (!club || club.qr_token !== token)
      return res.status(403).json({ message: 'Invalid QR code.' })

    const { rows } = await pool.query(
      `SELECT id, checked_in_at, checked_out_at FROM venue_checkins
       WHERE user_id=$1 AND club_id=$2 AND date=CURRENT_DATE`,
      [req.user.id, clubId]
    )
    if (!rows[0])
      return res.status(409).json({ message: 'Not checked in today.' })
    if (rows[0].checked_out_at)
      return res.status(409).json({ message: 'Already checked out today.' })

    const now = new Date()
    await pool.query(
      `UPDATE venue_checkins SET checked_out_at=$1 WHERE id=$2`,
      [now, rows[0].id]
    )
    const adminId = await getClubAdmin(clubId)
    if (adminId) {
      const duration = durationStr(now - new Date(rows[0].checked_in_at))
      await sendMsg(adminId, req.user.id,
        `👋 Signed out — ${fmtDateTime(now)} (${duration})`
      )
    }
    res.json({ message: 'Checked out.', checked_out_at: now })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/venue/today?date=YYYY-MM-DD  (admin)
router.get('/today', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  const date = req.query.date ?? new Date().toISOString().slice(0, 10)
  try {
    const { rows } = await pool.query(
      `SELECT vc.id, vc.checked_in_at, vc.checked_out_at,
              u.id AS user_id, u.name, u.role
       FROM venue_checkins vc
       JOIN users u ON u.id = vc.user_id
       WHERE vc.date=$1 AND vc.club_id=$2
       ORDER BY vc.checked_in_at ASC`,
      [date, clubId]
    )
    res.json({ checkins: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/venue/qr  (admin)
router.get('/qr', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  try {
    let { rows: [club] } = await pool.query(
      'SELECT qr_token, name FROM clubs WHERE id=$1', [clubId]
    )
    if (!club) return res.status(404).json({ message: 'Club not found.' })
    if (!club.qr_token) {
      const token = crypto.randomBytes(32).toString('hex')
      await pool.query('UPDATE clubs SET qr_token=$1 WHERE id=$2', [token, clubId])
      club.qr_token = token
    }
    const base = process.env.FRONTEND_URL || 'http://localhost:5173'
    res.json({
      token:     club.qr_token,
      url:       `${base}/scan?t=${club.qr_token}`,
      club_name: club.name,
    })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/venue/qr/regenerate  (admin)
router.post('/qr/regenerate', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  try {
    const token = crypto.randomBytes(32).toString('hex')
    await pool.query('UPDATE clubs SET qr_token=$1 WHERE id=$2', [token, clubId])
    const base = process.env.FRONTEND_URL || 'http://localhost:5173'
    res.json({ token, url: `${base}/scan?t=${token}` })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
