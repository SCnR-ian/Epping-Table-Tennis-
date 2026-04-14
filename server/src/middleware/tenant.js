const pool = require('../db')

// In-memory cache: subdomain → { club, cachedAt }
// Avoids a DB round-trip on every request. TTL: 5 minutes.
const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

async function getClubBySubdomain(subdomain) {
  const hit = cache.get(subdomain)
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.club

  const { rows } = await pool.query(
    'SELECT * FROM clubs WHERE subdomain = $1 AND is_active = TRUE',
    [subdomain]
  )
  const club = rows[0] || null
  cache.set(subdomain, { club, cachedAt: Date.now() })
  return club
}

function bustClubCache(subdomain) {
  cache.delete(subdomain)
}

async function tenantMiddleware(req, res, next) {
  const host = req.headers.host || ''
  const hostname = host.split(':')[0]   // strip port

  let subdomain = null

  // Production: epping.myapp.com → parts = ['epping', 'myapp', 'com']
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    subdomain = parts[0]
  }

  // Local dev fallbacks (in priority order):
  //   1. X-Club-Subdomain request header (useful for curl / tests)
  //   2. DEV_SUBDOMAIN env var (set in .env)
  if (!subdomain) {
    subdomain = req.headers['x-club-subdomain'] || process.env.DEV_SUBDOMAIN || null
  }

  if (!subdomain) {
    // Root domain with no club context — allow health checks / super-admin routes
    req.club = null
    return next()
  }

  try {
    const club = await getClubBySubdomain(subdomain)
    if (!club) {
      return res.status(404).json({ message: `Club '${subdomain}' not found.` })
    }
    req.club = club
    next()
  } catch (err) {
    console.error('Tenant middleware error:', err)
    res.status(500).json({ message: 'Server error resolving club.' })
  }
}

module.exports = { tenantMiddleware, bustClubCache }
