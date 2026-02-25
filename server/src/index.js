require('dotenv').config()
const express        = require('express')
const cors           = require('cors')
const session        = require('express-session')
const passport       = require('./config/passport')

const app  = express()
const PORT = process.env.PORT || 8000

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1)   // required on Render (runs behind a reverse proxy)
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.use('/api/schedule',      require('./routes/schedule'))
app.use('/api/announcements', require('./routes/announcements'))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Not found.' }))

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
