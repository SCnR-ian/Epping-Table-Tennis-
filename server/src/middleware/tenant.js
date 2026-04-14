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

// Platform domains that are NOT club subdomains — fall back to DEV_SUBDOMAIN
const PLATFORM_DOMAINS = ['onrender.com', 'vercel.app', 'netlify.app', 'railway.app', 'fly.dev']

async function tenantMiddleware(req, res, next) {
  const host = req.headers.host || ''
  const hostname = host.split(':')[0]   // strip port

  let subdomain = null

  // Check for explicit override header first (useful for curl / tests)
  if (req.headers['x-club-subdomain']) {
    subdomain = req.headers['x-club-subdomain']
  } else {
    const parts = hostname.split('.')
    const isPlatformDomain = PLATFORM_DOMAINS.some(d => hostname.endsWith('.' + d) || hostname === d)
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')

    if (!isPlatformDomain && !isLocalhost && parts.length >= 3) {
      // Production custom subdomain: epping.myapp.com → 'epping'
      subdomain = parts[0]
    }
  }

  // Fall back to DEV_SUBDOMAIN env var (covers local dev + platform domains)
  if (!subdomain) {
    subdomain = process.env.DEV_SUBDOMAIN || null
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
