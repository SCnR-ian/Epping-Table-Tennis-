/**
 * Middleware: validates the X-Super-Admin-Key header.
 * Used to protect super-admin endpoints that manage clubs.
 */
function requireSuperAdmin(req, res, next) {
  const key = req.headers['x-super-admin-key']
  if (!key || !process.env.SUPER_ADMIN_KEY || key !== process.env.SUPER_ADMIN_KEY) {
    return res.status(403).json({ message: 'Forbidden.' })
  }
  next()
}

module.exports = { requireSuperAdmin }
