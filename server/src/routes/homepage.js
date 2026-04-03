const router = require('express').Router()
const pool   = require('../db')
const multer = require('multer')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed.'))
  },
})

const CARDS = [
  { id: 'private',  title: 'One-on-One',     description: 'Private sessions tailored entirely to your game. Work 1-on-1 with a certified coach to build technique and reach your goals faster.' },
  { id: 'group',    title: 'Group Session',   description: 'Small-group sessions of 2–6 players. A great way to improve skills in a social setting with peers at a similar level.' },
  { id: 'school',   title: 'School Coaching', description: 'We partner with local schools to deliver table tennis as part of their sport and PE programs, with full equipment provided.' },
  { id: 'holiday',  title: 'School Holiday',  description: 'Fun, intensive holiday programs for juniors aged 7–17. Half-day and full-day options with mini-tournaments included.' },
]

// GET /api/homepage/stats — public club stats
router.get('/stats', async (req, res) => {
  try {
    const [members, coaching, social] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE role != 'admin'`),
      pool.query(`SELECT COUNT(DISTINCT date || coach_id::text)::int AS count FROM coaching_sessions WHERE status = 'confirmed' AND date >= DATE_TRUNC('week', CURRENT_DATE) AND date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM social_play_sessions WHERE status IN ('open','closed') AND date >= DATE_TRUNC('week', CURRENT_DATE) AND date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'`),
    ])
    const memberCount   = members.rows[0].count
    const memberRounded = Math.floor(memberCount / 10) * 10
    res.json({
      membersDisplay:   memberRounded > 0 ? `${memberRounded}+` : `${memberCount}`,
      coachingSessions: coaching.rows[0].count,
      socialSessions:   social.rows[0].count,
    })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/homepage/cards
router.get('/cards', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, image_filename FROM homepage_cards')
    const imageMap = Object.fromEntries(rows.map(r => [r.id, r]))
    const cards = CARDS.map(c => ({
      ...c,
      hasImage: !!imageMap[c.id]?.image_filename,
    }))
    res.json({ cards })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// GET /api/homepage/cards/:id/image
router.get('/cards/:id/image', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_data, image_filename FROM homepage_cards WHERE id=$1',
      [req.params.id]
    )
    if (!rows[0]?.image_data) return res.status(404).json({ message: 'No image.' })
    const buf  = Buffer.from(rows[0].image_data, 'base64')
    const ext  = (rows[0].image_filename || '').split('.').pop().toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(buf)
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/homepage/admin/cards/:id/image  (admin only)
router.post('/admin/cards/:id/image', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file provided.' })
  const validIds = CARDS.map(c => c.id)
  if (!validIds.includes(req.params.id)) return res.status(404).json({ message: 'Card not found.' })
  try {
    const imageData = req.file.buffer.toString('base64')
    await pool.query(
      `INSERT INTO homepage_cards (id, image_data, image_filename, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (id) DO UPDATE SET image_data=$2, image_filename=$3, updated_at=NOW()`,
      [req.params.id, imageData, req.file.originalname]
    )
    res.json({ message: 'Image updated.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/homepage/admin/cards/:id/image  (admin only)
router.delete('/admin/cards/:id/image', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM homepage_cards WHERE id=$1', [req.params.id])
    res.json({ message: 'Image removed.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

module.exports = router
