require('dotenv').config()
const express        = require('express')
const cors           = require('cors')
const session        = require('express-session')
const passport       = require('./config/passport')

const app  = express()
const PORT = process.env.PORT || 8000

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1)   // required on Render (runs behind a reverse proxy)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true)
    if (ALLOWED_ORIGINS.some(o => origin === o) || origin.endsWith('.vercel.app') || origin.endsWith('.devtunnels.ms') || /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin))
      return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json())

// Session is only needed during the brief OAuth redirect flow
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev_secret',
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000 },
}))
app.use(passport.initialize())
app.use(passport.session())

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/profile',       require('./routes/profile'))
app.use('/api/members',       require('./routes/members'))
app.use('/api/courts',        require('./routes/courts'))
app.use('/api/bookings',      require('./routes/bookings'))
app.use('/api/tournaments',   require('./routes/tournaments'))
app.use('/api/admin',         require('./routes/admin'))
app.use('/api/coaching',      require('./routes/coaching'))
app.use('/api/social',        require('./routes/social'))
app.use('/api/checkin',       require('./routes/checkin'))
app.use('/api/analytics',     require('./routes/analytics'))
app.use('/api/schedule',      require('./routes/schedule'))
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/homepage',      require('./routes/homepage'))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Not found.' }))

// ── Migrations ────────────────────────────────────────────────────────────────
// Idempotent schema patches applied at startup so new columns are never missing.
async function runMigrations() {
  const pool = require('./db')
  const patches = [
    `ALTER TABLE social_play_sessions ADD COLUMN IF NOT EXISTS recurrence_id UUID`,
    `CREATE INDEX IF NOT EXISTS idx_social_sessions_recurrence ON social_play_sessions(recurrence_id)`,
    `CREATE TABLE IF NOT EXISTS coaching_hour_ledger (
       id         SERIAL        PRIMARY KEY,
       user_id    INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       delta      DECIMAL(6,2)  NOT NULL,
       note       TEXT,
       session_id INTEGER       REFERENCES coaching_sessions(id) ON DELETE SET NULL,
       created_by INTEGER       REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_chl_user ON coaching_hour_ledger(user_id)`,
    `ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT FALSE`,
    `CREATE TABLE IF NOT EXISTS homepage_cards (
       id              VARCHAR(20)  PRIMARY KEY,
       image_data      TEXT,
       image_filename  VARCHAR(255),
       updated_at      TIMESTAMPTZ  DEFAULT NOW()
     )`,
  ]
  for (const sql of patches) {
    try { await pool.query(sql) } catch (e) { console.error('Migration warning:', e.message) }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
runMigrations().then(() =>
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`))
)
