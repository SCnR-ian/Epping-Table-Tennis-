/**
 * Full demo seed — populates every feature with realistic data.
 * Safe to re-run: users use ON CONFLICT UPDATE, everything else is
 * inserted fresh each run (old rows for upcoming dates are wiped first).
 *
 * Run from the project root:
 *   node server/src/db/seed_demo.js
 *
 * Password for all accounts: Test1234
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') })
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
const { randomUUID } = require('crypto')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** ISO date string (YYYY-MM-DD) for a day offset from today */
function isoDay(offsetDays = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/** Next occurrence of a weekday (0=Sun…6=Sat), at least `minOffset` days away */
function nextDow(dow, minOffset = 1) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const d = new Date(today)
  d.setDate(d.getDate() + minOffset)
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── Master data ──────────────────────────────────────────────────────────────

const PASSWORD = 'Test1234'

const USERS = [
  { name: 'Admin User',     email: 'admin@ttclub.com',   phone: '0400000001', role: 'admin'  },
  { name: 'Sarah Chen',     email: 'sarah@ttclub.com',   phone: '0400000002', role: 'coach'  },
  { name: 'James Park',     email: 'james@ttclub.com',   phone: '0400000003', role: 'coach'  },
  { name: 'Mei Zhang',      email: 'mei@ttclub.com',     phone: '0400000004', role: 'coach'  },
  { name: 'Tom Wilson',     email: 'tom@ttclub.com',     phone: '0400000005', role: 'member' },
  { name: 'Lisa Nguyen',    email: 'lisa@ttclub.com',    phone: '0400000006', role: 'member' },
  { name: 'Kevin Patel',    email: 'kevin@ttclub.com',   phone: '0400000007', role: 'member' },
  { name: 'Emma Roberts',   email: 'emma@ttclub.com',    phone: '0400000008', role: 'member' },
  { name: 'Daniel Kim',     email: 'daniel@ttclub.com',  phone: '0400000009', role: 'member' },
  { name: 'Olivia Brown',   email: 'olivia@ttclub.com',  phone: '0400000010', role: 'member' },
]

const COACHES = [
  { email: 'sarah@ttclub.com', bio: 'National-level competitor, 10+ years coaching.' },
  { email: 'james@ttclub.com', bio: 'Specialises in defensive play and footwork drills.' },
  { email: 'mei@ttclub.com',   bio: 'Former state champion, focuses on junior development.' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12)
  console.log(`Hashing password "${PASSWORD}"…`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── 1. Users ──────────────────────────────────────────────────────────────
    console.log('\n── Users ──')
    const userIds = {}
    for (const u of USERS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO UPDATE
           SET name=EXCLUDED.name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash
         RETURNING id, email, role`,
        [u.name, u.email, hash, u.phone, u.role]
      )
      userIds[u.email] = rows[0].id
      console.log(`  ✓ ${rows[0].role.padEnd(6)} ${rows[0].email}  (id=${rows[0].id})`)
    }

    // ── 2. Coaches ────────────────────────────────────────────────────────────
    console.log('\n── Coaches ──')
    const coachIds = {}
    for (const c of COACHES) {
      const uid = userIds[c.email]
      const { rows } = await client.query(
        `INSERT INTO coaches (name, bio, user_id)
         SELECT name, $1, $2 FROM users WHERE id=$2
         ON CONFLICT (user_id) DO UPDATE SET bio=EXCLUDED.bio
         RETURNING id`,
        [c.bio, uid]
      )
      coachIds[c.email] = rows[0].id
      console.log(`  ✓ Coach ${c.email}  (coach_id=${rows[0].id})`)
    }

    // ── 3. Courts (already seeded by schema.sql) ──────────────────────────────
    const { rows: courts } = await client.query('SELECT id FROM courts ORDER BY id')
    const courtIds = courts.map(r => r.id)
    console.log(`\n── Courts: ${courtIds.join(', ')} ──`)

    // ── 4. Clear upcoming demo data (so re-runs are clean) ───────────────────
    await client.query(`DELETE FROM coaching_sessions  WHERE date >= CURRENT_DATE`)
    await client.query(`DELETE FROM social_play_sessions WHERE date >= CURRENT_DATE`)
    await client.query(`DELETE FROM bookings WHERE date >= CURRENT_DATE`)
    await client.query(`DELETE FROM tournament_registrations`)
    await client.query(`DELETE FROM tournaments WHERE date >= CURRENT_DATE`)
    await client.query(`DELETE FROM announcements`)
    console.log('\n── Cleared existing upcoming data ──')

    // ── 5. Announcements ──────────────────────────────────────────────────────
    console.log('\n── Announcements ──')
    const announcements = [
      {
        title: 'Welcome to the new club portal!',
        body:  'You can now book courts, sign up for social play, and view your coaching schedule all in one place. Let us know if you have any feedback.',
      },
      {
        title: 'New coaching packages available',
        body:  'Sarah, James, and Mei are now taking private bookings for 1-on-1 coaching. Sessions are 1 hour and can be booked through the admin.',
      },
      {
        title: `Summer Tournament — ${nextDow(6, 14)}`,
        body:  'Registration is open for our summer singles tournament. Places are limited to 32 players — don\'t miss out!',
      },
    ]
    for (const a of announcements) {
      await client.query(
        'INSERT INTO announcements (title, body) VALUES ($1,$2)',
        [a.title, a.body]
      )
      console.log(`  ✓ "${a.title}"`)
    }

    // ── 6. Tournaments ────────────────────────────────────────────────────────
    console.log('\n── Tournaments ──')
    const { rows: [t1] } = await client.query(
      `INSERT INTO tournaments (name, date, prize, status, max_participants, format)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ['Summer Singles Championship', nextDow(6, 14), '$200 gift card', 'open', 16, 'Singles']
    )
    const { rows: [t2] } = await client.query(
      `INSERT INTO tournaments (name, date, prize, status, max_participants, format)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ['Club Doubles Night', nextDow(3, 21), 'Trophy', 'upcoming', 8, 'Doubles']
    )
    console.log(`  ✓ Tournament #${t1.id} — Summer Singles (${nextDow(6, 14)})`)
    console.log(`  ✓ Tournament #${t2.id} — Club Doubles  (${nextDow(3, 21)})`)

    // Register some members in the open tournament
    const t1Members = ['tom@ttclub.com', 'lisa@ttclub.com', 'kevin@ttclub.com', 'emma@ttclub.com']
    for (const email of t1Members) {
      await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [t1.id, userIds[email]]
      )
    }
    console.log(`  ✓ ${t1Members.length} members registered in Summer Singles`)

    // ── 7. Coaching sessions ──────────────────────────────────────────────────
    console.log('\n── Coaching sessions ──')
    // Sarah coaches Tom every Tuesday 18:00–19:00 for 4 weeks
    const sarahTomRecurrence = randomUUID()
    const tueDates = [nextDow(2, 1), nextDow(2, 8), nextDow(2, 15), nextDow(2, 22)]
    for (const d of tueDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['sarah@ttclub.com'], userIds['tom@ttclub.com'], courtIds[0],
         d, '18:00', '19:00', 'Focus on forehand loop', sarahTomRecurrence]
      )
    }
    console.log(`  ✓ Sarah → Tom  ×4 Tuesdays 18:00–19:00 (Court 1)`)

    // James coaches Lisa every Wednesday 18:30–19:30 for 2 weeks
    const jamesLisaRecurrence = randomUUID()
    const wedDates = [nextDow(3, 1), nextDow(3, 8)]
    for (const d of wedDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['james@ttclub.com'], userIds['lisa@ttclub.com'], courtIds[1],
         d, '18:30', '19:30', 'Defensive footwork', jamesLisaRecurrence]
      )
    }
    console.log(`  ✓ James → Lisa ×2 Wednesdays 18:30–19:30 (Court 2)`)

    // Mei coaches Kevin once next Saturday 13:00–14:00
    const sat1 = nextDow(6, 1)
    await client.query(
      `INSERT INTO coaching_sessions
         (coach_id, student_id, court_id, date, start_time, end_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['kevin@ttclub.com'], courtIds[2],
       sat1, '13:00', '14:00', 'Junior technique review']
    )
    console.log(`  ✓ Mei → Kevin  ×1 Saturday ${sat1} 13:00–14:00 (Court 3)`)

    // ── 8. Social play sessions ───────────────────────────────────────────────
    console.log('\n── Social play sessions ──')
    const mon1 = nextDow(1, 1)
    const mon2 = nextDow(1, 8)
    const sat2 = nextDow(6, 7)

    const { rows: [sp1] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Monday Night Social', 'Casual round-robin — all levels welcome', 3,
       mon1, '19:00', '21:00', 18, userIds['admin@ttclub.com']]
    )
    const { rows: [sp2] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Monday Night Social', 'Casual round-robin — all levels welcome', 3,
       mon2, '19:00', '21:00', 18, userIds['admin@ttclub.com']]
    )
    const { rows: [sp3] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Saturday Social Doubles', 'Doubles format, bring a partner or get matched', 2,
       sat2, '14:00', '16:30', 12, userIds['admin@ttclub.com']]
    )
    console.log(`  ✓ Monday Night Social  ${mon1} 19:00–21:00 (3 courts, id=${sp1.id})`)
    console.log(`  ✓ Monday Night Social  ${mon2} 19:00–21:00 (3 courts, id=${sp2.id})`)
    console.log(`  ✓ Saturday Doubles     ${sat2} 14:00–16:30 (2 courts, id=${sp3.id})`)

    // Sign up some members for sp1
    const sp1Participants = ['emma@ttclub.com', 'daniel@ttclub.com', 'olivia@ttclub.com']
    for (const email of sp1Participants) {
      await client.query(
        `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [sp1.id, userIds[email]]
      )
    }
    console.log(`  ✓ ${sp1Participants.length} participants joined Monday Night Social (${mon1})`)

    // Sign up some members for sp3
    const sp3Participants = ['tom@ttclub.com', 'daniel@ttclub.com']
    for (const email of sp3Participants) {
      await client.query(
        `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [sp3.id, userIds[email]]
      )
    }
    console.log(`  ✓ ${sp3Participants.length} participants joined Saturday Doubles (${sat2})`)

    // ── 9. Regular bookings ───────────────────────────────────────────────────
    console.log('\n── Bookings ──')

    // Kevin books Court 4 next Monday 16:00–17:00 (2 slots)
    const kgId = randomUUID()
    for (const [s, e] of [['16:00', '16:30'], ['16:30', '17:00']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['kevin@ttclub.com'], courtIds[3], mon1, s, e, kgId]
      )
    }
    console.log(`  ✓ Kevin  — Court 4  ${mon1} 16:00–17:00`)

    // Lisa books Court 5 next Wednesday 17:00–18:00
    const lgId = randomUUID()
    const wed1 = nextDow(3, 1)
    for (const [s, e] of [['17:00', '17:30'], ['17:30', '18:00']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['lisa@ttclub.com'], courtIds[4], wed1, s, e, lgId]
      )
    }
    console.log(`  ✓ Lisa   — Court 5  ${wed1} 17:00–18:00`)

    // Emma books Court 6 next Saturday 12:00–13:30 (3 slots)
    const egId = randomUUID()
    for (const [s, e] of [['12:00', '12:30'], ['12:30', '13:00'], ['13:00', '13:30']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['emma@ttclub.com'], courtIds[5], sat1, s, e, egId]
      )
    }
    console.log(`  ✓ Emma   — Court 6  ${sat1} 12:00–13:30`)

    // Daniel books Court 4 next Saturday 15:00–16:00
    const dgId = randomUUID()
    for (const [s, e] of [['15:00', '15:30'], ['15:30', '16:00']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['daniel@ttclub.com'], courtIds[3], sat1, s, e, dgId]
      )
    }
    console.log(`  ✓ Daniel — Court 4  ${sat1} 15:00–16:00`)

    await client.query('COMMIT')
    console.log('\n✅  Demo seed complete!\n')
    console.log('── Login credentials (password: Test1234) ───────────────────')
    console.log('  admin@ttclub.com  → admin')
    console.log('  sarah@ttclub.com  → coach  (4 coaching sessions as coach)')
    console.log('  james@ttclub.com  → coach  (2 coaching sessions as coach)')
    console.log('  mei@ttclub.com    → coach  (1 coaching session as coach)')
    console.log('  tom@ttclub.com    → member (coaching + tournament + social)')
    console.log('  lisa@ttclub.com   → member (coaching + booking)')
    console.log('  kevin@ttclub.com  → member (coaching + booking + tournament)')
    console.log('  emma@ttclub.com   → member (booking + social + tournament)')
    console.log('  daniel@ttclub.com → member (booking + social)')
    console.log('  olivia@ttclub.com → member (social)')
    console.log('─────────────────────────────────────────────────────────────')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n❌  Seed failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
