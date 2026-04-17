const router  = require('express').Router()
const pool    = require('../db')
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const { requireAuth } = require('../middleware/auth')

const UPLOAD_DIR = path.join(__dirname, '../../uploads/products')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

const CATEGORIES = ['rubbers', 'blades', 'care', 'shoes', 'balls', 'rackets']

// GET /api/shop/products?category=rubbers
router.get('/products', async (req, res) => {
  const clubId = req.club?.id ?? 1
  const { category } = req.query
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, price, description, sort_order,
              image_url
       FROM products
       WHERE club_id=$1 AND is_active=TRUE
         ${category && CATEGORIES.includes(category) ? `AND category=$2` : ''}
       ORDER BY sort_order ASC, id ASC`,
      category && CATEGORIES.includes(category) ? [clubId, category] : [clubId]
    )
    res.json({ products: rows })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/shop/products (admin)
router.post('/products', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  const { name, category, price, description, sort_order } = req.body
  if (!name || !category) return res.status(400).json({ message: 'name and category required.' })
  if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Invalid category.' })
  try {
    const { rows: [p] } = await pool.query(
      `INSERT INTO products (name, category, price, description, sort_order, club_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, category, price ?? null, description ?? null, sort_order ?? 0, clubId]
    )
    res.status(201).json({ product: p })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// PATCH /api/shop/products/:id (admin)
router.patch('/products/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  const { name, category, price, description, sort_order, is_active } = req.body
  try {
    const { rows: [p] } = await pool.query(
      `UPDATE products SET
         name=$1, category=$2, price=$3, description=$4,
         sort_order=$5, is_active=$6
       WHERE id=$7 AND club_id=$8 RETURNING *`,
      [name, category, price ?? null, description ?? null,
       sort_order ?? 0, is_active ?? true, req.params.id, clubId]
    )
    if (!p) return res.status(404).json({ message: 'Not found.' })
    res.json({ product: p })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// DELETE /api/shop/products/:id (admin)
router.delete('/products/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  try {
    // delete image file if exists
    const { rows: [p] } = await pool.query(
      'SELECT image_url FROM products WHERE id=$1 AND club_id=$2', [req.params.id, clubId]
    )
    if (p?.image_url) {
      const file = path.join(UPLOAD_DIR, path.basename(p.image_url))
      fs.unlink(file, () => {})
    }
    await pool.query('DELETE FROM products WHERE id=$1 AND club_id=$2', [req.params.id, clubId])
    res.json({ message: 'Deleted.' })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// POST /api/shop/products/:id/image (admin)
router.post('/products/:id/image', requireAuth, upload.single('image'), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' })
  const clubId = req.club?.id ?? 1
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' })
  try {
    const imageUrl = `/uploads/products/${req.file.filename}`
    // delete old image
    const { rows: [old] } = await pool.query(
      'SELECT image_url FROM products WHERE id=$1 AND club_id=$2', [req.params.id, clubId]
    )
    if (old?.image_url) {
      const file = path.join(UPLOAD_DIR, path.basename(old.image_url))
      fs.unlink(file, () => {})
    }
    const { rows: [p] } = await pool.query(
      'UPDATE products SET image_url=$1 WHERE id=$2 AND club_id=$3 RETURNING *',
      [imageUrl, req.params.id, clubId]
    )
    if (!p) return res.status(404).json({ message: 'Not found.' })
    res.json({ product: p })
  } catch { res.status(500).json({ message: 'Server error.' }) }
})

// Serve product images
router.get('/images/:filename', (req, res) => {
  res.sendFile(path.join(UPLOAD_DIR, req.params.filename))
})

module.exports = router
