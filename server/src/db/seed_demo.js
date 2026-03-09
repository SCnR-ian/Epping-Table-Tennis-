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
      const { rows: existing } = await client.query(
        'SELECT id FROM coaches WHERE user_id=$1', [uid]
      )
      let coachId
      if (existing[0]) {
        await client.query('UPDATE coaches SET bio=$1 WHERE id=$2', [c.bio, existing[0].id])
        coachId = existing[0].id
      } else {
        const { rows } = await client.query(
          `INSERT INTO coaches (name, bio, user_id)
           SELECT name, $1, $2 FROM users WHERE id=$2 RETURNING id`,
          [c.bio, uid]
        )
        coachId = rows[0].id
      }
      coachIds[c.email] = coachId
      console.log(`  ✓ Coach ${c.email}  (coach_id=${coachId})`)
    }

    // ── 3. Courts ─────────────────────────────────────────────────────────────
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
    // Week layout (no participant conflicts):
    //   Tuesday  18:00–19:00  Sarah  → Tom    (Court 1) × 4 weeks
    //   Tuesday  19:00–20:00  James  → Daniel (Court 2) × 4 weeks
    //   Wednesday 18:30–19:30 James  → Lisa   (Court 2) × 2 weeks  [Lisa books Wed 17:00–18:00 on Court 5 — no overlap]
    //   Thursday 19:00–20:00  Sarah  → Emma   (Court 1) × 2 weeks
    //   Friday   17:00–18:00  Mei    → Olivia (Court 3) × 1
    //   Saturday 13:00–14:00  Mei    → Kevin  (Court 3) × 1
    console.log('\n── Coaching sessions ──')

    // Sarah → Tom: every Tuesday 18:00–19:00 for 4 weeks
    const sarahTomRec = randomUUID()
    const tueDates = [nextDow(2, 1), nextDow(2, 8), nextDow(2, 15), nextDow(2, 22)]
    for (const d of tueDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['sarah@ttclub.com'], userIds['tom@ttclub.com'], courtIds[0],
         d, '18:00', '19:00', 'Focus on forehand loop', sarahTomRec]
      )
    }
    console.log(`  ✓ Sarah → Tom    ×4 Tuesdays 18:00–19:00 (Court 1)`)

    // James → Daniel: every Tuesday 19:00–20:00 for 4 weeks
    const jamesDanielRec = randomUUID()
    for (const d of tueDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['james@ttclub.com'], userIds['daniel@ttclub.com'], courtIds[1],
         d, '19:00', '20:00', 'Backhand consistency drills', jamesDanielRec]
      )
    }
    console.log(`  ✓ James → Daniel ×4 Tuesdays 19:00–20:00 (Court 2)`)

    // James → Lisa: every Wednesday 18:30–19:30 for 2 weeks
    const jamesLisaRec = randomUUID()
    const wedDates = [nextDow(3, 1), nextDow(3, 8)]
    for (const d of wedDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['james@ttclub.com'], userIds['lisa@ttclub.com'], courtIds[1],
         d, '18:30', '19:30', 'Defensive footwork and service return', jamesLisaRec]
      )
    }
    console.log(`  ✓ James → Lisa   ×2 Wednesdays 18:30–19:30 (Court 2)`)

    // Sarah → Emma: every Thursday 19:00–20:00 for 2 weeks
    const sarahEmmaRec = randomUUID()
    const thuDates = [nextDow(4, 1), nextDow(4, 8)]
    for (const d of thuDates) {
      await client.query(
        `INSERT INTO coaching_sessions
           (coach_id, student_id, court_id, date, start_time, end_time, notes, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [coachIds['sarah@ttclub.com'], userIds['emma@ttclub.com'], courtIds[0],
         d, '19:00', '20:00', 'Serve variation and third-ball attack', sarahEmmaRec]
      )
    }
    console.log(`  ✓ Sarah → Emma   ×2 Thursdays 19:00–20:00 (Court 1)`)

    // Mei → Olivia: next Friday 17:00–18:00
    const fri1 = nextDow(5, 1)
    await client.query(
      `INSERT INTO coaching_sessions
         (coach_id, student_id, court_id, date, start_time, end_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['olivia@ttclub.com'], courtIds[2],
       fri1, '17:00', '18:00', 'Beginner fundamentals — grip and stance']
    )
    console.log(`  ✓ Mei   → Olivia ×1 Friday    ${fri1} 17:00–18:00 (Court 3)`)

    // Mei → Kevin: next Saturday 13:00–14:00
    const sat1 = nextDow(6, 1)
    const sat2 = nextDow(6, 8)   // following Saturday (for Emma's booking, avoiding fullDay conflict)
    await client.query(
      `INSERT INTO coaching_sessions
         (coach_id, student_id, court_id, date, start_time, end_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['kevin@ttclub.com'], courtIds[2],
       sat1, '13:00', '14:00', 'Junior technique review']
    )
    console.log(`  ✓ Mei   → Kevin  ×1 Saturday  ${sat1} 13:00–14:00 (Court 3)`)

    // ── 8. Social play sessions (2 total) ─────────────────────────────────────
    // Monday Night Social 19:00–21:00  — Emma, Daniel, Olivia join
    // Saturday Social     14:00–16:30  — Tom, Lisa, Kevin join
    //   (Kevin's coaching ends at 14:00; social starts at 14:00 — adjacent, no overlap ✓)
    console.log('\n── Social play sessions ──')
    const mon1 = nextDow(1, 1)

    const { rows: [sp1] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Monday Night Social', 'Casual round-robin — all levels welcome', 3,
       mon1, '19:00', '21:00', 18, userIds['admin@ttclub.com']]
    )
    for (const email of ['emma@ttclub.com', 'daniel@ttclub.com', 'olivia@ttclub.com']) {
      await client.query(
        `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [sp1.id, userIds[email]]
      )
    }
    console.log(`  ✓ Monday Night Social  ${mon1} 19:00–21:00 (3 courts) — Emma, Daniel, Olivia`)

    const { rows: [sp2] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Saturday Social Doubles', 'Doubles format — bring a partner or get matched up', 2,
       sat2, '14:00', '16:30', 12, userIds['admin@ttclub.com']]
    )
    for (const email of ['tom@ttclub.com', 'lisa@ttclub.com', 'kevin@ttclub.com']) {
      await client.query(
        `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [sp2.id, userIds[email]]
      )
    }
    console.log(`  ✓ Saturday Social      ${sat2} 14:00–16:30 (2 courts) — Tom, Lisa, Kevin`)

    // ── 9. Regular bookings (5 members, spread across the week) ──────────────
    // Mon  Kevin  Court 4  16:00–17:30  (no overlap with Monday social at 19:00)
    // Tue  —      (coaching night)
    // Wed  Lisa   Court 5  17:00–18:00  (coaching at 18:30 on Court 2 — different court & time ✓)
    // Thu  Tom    Court 1  17:00–18:00  (coaching at 19:00 on Court 1 — 1 hr gap ✓)
    // Fri  Daniel Court 4  18:00–19:00
    // Sat  Emma   Court 6  12:00–13:30  (coaching at 13:00 on Court 3 — different court ✓)
    console.log('\n── Bookings (5 members) ──')

    // Kevin — Monday 16:00–17:30 Court 4
    const kgId = randomUUID()
    for (const [s, e] of [['16:00', '16:30'], ['16:30', '17:00'], ['17:00', '17:30']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['kevin@ttclub.com'], courtIds[3], mon1, s, e, kgId]
      )
    }
    console.log(`  ✓ Kevin  — Court 4  ${mon1} 16:00–17:30`)

    // Lisa — Wednesday 17:00–18:00 Court 5
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

    // Tom — Thursday 17:00–18:00 Court 1
    const tgId = randomUUID()
    const thu1 = nextDow(4, 1)
    for (const [s, e] of [['17:00', '17:30'], ['17:30', '18:00']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['tom@ttclub.com'], courtIds[0], thu1, s, e, tgId]
      )
    }
    console.log(`  ✓ Tom    — Court 1  ${thu1} 17:00–18:00`)

    // Daniel — Friday 18:00–19:00 Court 4
    const dgId = randomUUID()
    for (const [s, e] of [['18:00', '18:30'], ['18:30', '19:00']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['daniel@ttclub.com'], courtIds[3], fri1, s, e, dgId]
      )
    }
    console.log(`  ✓ Daniel — Court 4  ${fri1} 18:00–19:00`)

    // Emma — Saturday 12:00–13:30 Court 6
    const egId = randomUUID()
    for (const [s, e] of [['12:00', '12:30'], ['12:30', '13:00'], ['13:00', '13:30']]) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userIds['emma@ttclub.com'], courtIds[5], sat2, s, e, egId]
      )
    }
    console.log(`  ✓ Emma   — Court 6  ${sat2} 12:00–13:30`)

    // ── 10. Fully packed day (second Saturday) ────────────────────────────────
    // Every court is occupied for every slot (12:00–18:00, 6 courts).
    //
    // 12:00–14:00  Courts 1–3 → Social Play "Morning Session"  (Lisa, Olivia join)
    //              Court  4   → Coaching: Sarah→Tom 12-13, James→Daniel 13-14
    //              Court  5   → Booking:  Kevin 12:00–14:00
    //              Court  6   → Booking:  Emma  12:00–14:00
    //
    // 14:00–16:00  Court  1   → Coaching: Mei→Kevin 14-15, Mei→Olivia 15-16
    //              Court  2   → Coaching: Sarah→Emma 14-15, James→Lisa 15-16
    //              Court  3   → Booking:  Tom    14:00–16:00
    //              Court  4   → Booking:  Daniel 14:00–16:00
    //              Court  5   → Booking:  Lisa 14-15, Kevin 15-16
    //              Court  6   → Booking:  Olivia 14-15, Emma 15-16
    //
    // 16:00–18:00  Courts 1–6 → Social Play "Evening Social"  (all 6 members join)
    const fullDay = '2026-03-14'
    console.log(`\n── Fully packed day: ${fullDay} ──`)

    // Social Play 1 — Morning Session 12:00–14:00, 3 courts
    const { rows: [fpSp1] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Morning Session', 'Open play — all levels welcome', 3,
       fullDay, '12:00', '14:00', 18, userIds['admin@ttclub.com']]
    )
    for (const email of ['lisa@ttclub.com', 'olivia@ttclub.com']) {
      await client.query(
        'INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)',
        [fpSp1.id, userIds[email]]
      )
    }
    console.log(`  ✓ Social: Morning Session ${fullDay} 12:00–14:00 (courts 1–3) — Lisa, Olivia`)

    // Social Play 2 — Evening Social 16:00–18:00, 6 courts
    const { rows: [fpSp2] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Evening Social', 'Club social — all members welcome', 6,
       fullDay, '16:00', '18:00', 24, userIds['admin@ttclub.com']]
    )
    for (const email of ['tom@ttclub.com', 'lisa@ttclub.com', 'kevin@ttclub.com',
                          'emma@ttclub.com', 'daniel@ttclub.com', 'olivia@ttclub.com']) {
      await client.query(
        'INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)',
        [fpSp2.id, userIds[email]]
      )
    }
    console.log(`  ✓ Social: Evening Social   ${fullDay} 16:00–18:00 (courts 1–6) — all members`)

    // Coaching — Court 4: Sarah→Tom 12:00–13:00, James→Daniel 13:00–14:00
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['sarah@ttclub.com'], userIds['tom@ttclub.com'],    courtIds[3], fullDay, '12:00','13:00','Serve and third-ball attack']
    )
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['james@ttclub.com'], userIds['daniel@ttclub.com'], courtIds[3], fullDay, '13:00','14:00','Backhand loop consistency']
    )
    console.log(`  ✓ Coaching: Court 4 — Sarah→Tom 12-13, James→Daniel 13-14`)

    // Coaching — Court 1: Mei→Kevin 14:00–15:00, Mei→Olivia 15:00–16:00
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['kevin@ttclub.com'],  courtIds[0], fullDay, '14:00','15:00','Footwork and placement']
    )
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['olivia@ttclub.com'], courtIds[0], fullDay, '15:00','16:00','Fundamentals — grip and stance']
    )
    console.log(`  ✓ Coaching: Court 1 — Mei→Kevin 14-15, Mei→Olivia 15-16`)

    // Coaching — Court 2: Sarah→Emma 14:00–15:00, James→Lisa 15:00–16:00
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['sarah@ttclub.com'], userIds['emma@ttclub.com'], courtIds[1], fullDay, '14:00','15:00','Forehand drive and loop']
    )
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['james@ttclub.com'], userIds['lisa@ttclub.com'], courtIds[1], fullDay, '15:00','16:00','Service variation and return']
    )
    console.log(`  ✓ Coaching: Court 2 — Sarah→Emma 14-15, James→Lisa 15-16`)

    // Bookings — helper for inserting 30-min slots
    const insertSlots = async (userId, courtId, date, slots, groupId) => {
      for (const [s, e] of slots) {
        await client.query(
          `INSERT INTO bookings (user_id,court_id,date,start_time,end_time,booking_group_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [userId, courtId, date, s, e, groupId]
        )
      }
    }

    // Court 5 — Kevin 12:00–14:00, Lisa 14:00–15:00, Kevin 15:00–16:00
    await insertSlots(userIds['kevin@ttclub.com'], courtIds[4], fullDay,
      [['12:00','12:30'],['12:30','13:00'],['13:00','13:30'],['13:30','14:00']], randomUUID())
    await insertSlots(userIds['lisa@ttclub.com'],  courtIds[4], fullDay,
      [['14:00','14:30'],['14:30','15:00']], randomUUID())
    await insertSlots(userIds['kevin@ttclub.com'], courtIds[4], fullDay,
      [['15:00','15:30'],['15:30','16:00']], randomUUID())
    console.log(`  ✓ Bookings: Court 5 — Kevin 12-14, Lisa 14-15, Kevin 15-16`)

    // Court 6 — Emma 12:00–14:00, Olivia 14:00–15:00, Emma 15:00–16:00
    await insertSlots(userIds['emma@ttclub.com'],   courtIds[5], fullDay,
      [['12:00','12:30'],['12:30','13:00'],['13:00','13:30'],['13:30','14:00']], randomUUID())
    await insertSlots(userIds['olivia@ttclub.com'], courtIds[5], fullDay,
      [['14:00','14:30'],['14:30','15:00']], randomUUID())
    await insertSlots(userIds['emma@ttclub.com'],   courtIds[5], fullDay,
      [['15:00','15:30'],['15:30','16:00']], randomUUID())
    console.log(`  ✓ Bookings: Court 6 — Emma 12-14, Olivia 14-15, Emma 15-16`)

    // Court 3 — Tom 14:00–16:00
    await insertSlots(userIds['tom@ttclub.com'], courtIds[2], fullDay,
      [['14:00','14:30'],['14:30','15:00'],['15:00','15:30'],['15:30','16:00']], randomUUID())
    console.log(`  ✓ Bookings: Court 3 — Tom 14-16`)

    // Court 4 — Daniel 14:00–16:00
    await insertSlots(userIds['daniel@ttclub.com'], courtIds[3], fullDay,
      [['14:00','14:30'],['14:30','15:00'],['15:00','15:30'],['15:30','16:00']], randomUUID())
    console.log(`  ✓ Bookings: Court 4 — Daniel 14-16`)

    // ── 11. March 10 — 4 bookings, 2 coaching sessions, 2 social plays ───────
    // Note: weekly seed already places Sarah→Tom (Court 1, 18–19) and
    //       James→Daniel (Court 2, 19–20) on this Tuesday — all additions below
    //       use different courts and non-overlapping times.
    //
    // Social 1:  courts 1–2  10:00–12:00  (Lisa, Kevin)
    // Social 2:  courts 1–2  15:00–17:00  (Tom, Emma)
    // Coaching:  Mei→Daniel  Court 3  13:00–14:00
    //            James→Olivia Court 4  13:00–14:00
    // Bookings:  Daniel Court 5 10–11, Olivia Court 6 10–11
    //            Kevin  Court 3 15–16, Lisa   Court 4 15–16
    const mar10 = '2026-03-10'
    console.log(`\n── March 10 extras: ${mar10} ──`)

    const { rows: [mar10sp1] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Tuesday Open Play', 'Drop-in open play — all levels welcome', 2,
       mar10, '10:00', '12:00', 12, userIds['admin@ttclub.com']]
    )
    for (const email of ['lisa@ttclub.com', 'kevin@ttclub.com'])
      await client.query(`INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
        [mar10sp1.id, userIds[email]])
    console.log(`  ✓ Social: Tuesday Open Play  ${mar10} 10:00–12:00 (courts 1–2) — Lisa, Kevin`)

    const { rows: [mar10sp2] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Tuesday Afternoon Social', 'Casual afternoon round-robin', 2,
       mar10, '15:00', '17:00', 12, userIds['admin@ttclub.com']]
    )
    for (const email of ['tom@ttclub.com', 'emma@ttclub.com'])
      await client.query(`INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
        [mar10sp2.id, userIds[email]])
    console.log(`  ✓ Social: Tue Afternoon Social ${mar10} 15:00–17:00 (courts 1–2) — Tom, Emma`)

    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['daniel@ttclub.com'], courtIds[2], mar10, '13:00', '14:00', 'Serve and footwork fundamentals']
    )
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['james@ttclub.com'], userIds['olivia@ttclub.com'], courtIds[3], mar10, '13:00', '14:00', 'Backhand and placement drills']
    )
    console.log(`  ✓ Coaching: Mei→Daniel Court 3 13–14, James→Olivia Court 4 13–14`)

    await insertSlots(userIds['daniel@ttclub.com'], courtIds[4], mar10, [['10:00','10:30'],['10:30','11:00']], randomUUID())
    await insertSlots(userIds['olivia@ttclub.com'], courtIds[5], mar10, [['10:00','10:30'],['10:30','11:00']], randomUUID())
    await insertSlots(userIds['kevin@ttclub.com'],  courtIds[2], mar10, [['15:00','15:30'],['15:30','16:00']], randomUUID())
    await insertSlots(userIds['lisa@ttclub.com'],   courtIds[3], mar10, [['15:00','15:30'],['15:30','16:00']], randomUUID())
    console.log(`  ✓ Bookings: Daniel Ct5 10–11, Olivia Ct6 10–11, Kevin Ct3 15–16, Lisa Ct4 15–16`)

    // ── 12. March 18 — 4 bookings, 2 coaching sessions, 2 social plays ───────
    // Note: weekly seed already places James→Lisa (Court 2, 18:30–19:30) on
    //       this Wednesday — all additions below avoid that court/time.
    //
    // Social 1:  courts 1–2  09:00–11:00  (Tom, Kevin)
    // Social 2:  courts 1–2  14:00–16:00  (Emma, Daniel)
    // Coaching:  Sarah→Olivia Court 3  11:00–12:00
    //            Mei→Tom      Court 4  11:00–12:00
    // Bookings:  Kevin Court 3 13–14, Lisa  Court 4 13–14
    //            Daniel Court 5 13–14, Emma Court 6 13–14
    const mar18 = '2026-03-18'
    console.log(`\n── March 18 extras: ${mar18} ──`)

    const { rows: [mar18sp1] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Wednesday Morning Play', 'Morning warm-up — all welcome', 2,
       mar18, '09:00', '11:00', 12, userIds['admin@ttclub.com']]
    )
    for (const email of ['tom@ttclub.com', 'kevin@ttclub.com'])
      await client.query(`INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
        [mar18sp1.id, userIds[email]])
    console.log(`  ✓ Social: Wed Morning Play   ${mar18} 09:00–11:00 (courts 1–2) — Tom, Kevin`)

    const { rows: [mar18sp2] } = await client.query(
      `INSERT INTO social_play_sessions
         (title, description, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Wednesday Afternoon Social', 'Doubles practice afternoon', 2,
       mar18, '14:00', '16:00', 12, userIds['admin@ttclub.com']]
    )
    for (const email of ['emma@ttclub.com', 'daniel@ttclub.com'])
      await client.query(`INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
        [mar18sp2.id, userIds[email]])
    console.log(`  ✓ Social: Wed Afternoon Social ${mar18} 14:00–16:00 (courts 1–2) — Emma, Daniel`)

    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['sarah@ttclub.com'], userIds['olivia@ttclub.com'], courtIds[2], mar18, '11:00', '12:00', 'Spin variation and attack patterns']
    )
    await client.query(
      `INSERT INTO coaching_sessions (coach_id,student_id,court_id,date,start_time,end_time,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [coachIds['mei@ttclub.com'], userIds['tom@ttclub.com'], courtIds[3], mar18, '11:00', '12:00', 'Multi-ball serve practice']
    )
    console.log(`  ✓ Coaching: Sarah→Olivia Court 3 11–12, Mei→Tom Court 4 11–12`)

    await insertSlots(userIds['kevin@ttclub.com'],  courtIds[2], mar18, [['13:00','13:30'],['13:30','14:00']], randomUUID())
    await insertSlots(userIds['lisa@ttclub.com'],   courtIds[3], mar18, [['13:00','13:30'],['13:30','14:00']], randomUUID())
    await insertSlots(userIds['daniel@ttclub.com'], courtIds[4], mar18, [['13:00','13:30'],['13:30','14:00']], randomUUID())
    await insertSlots(userIds['emma@ttclub.com'],   courtIds[5], mar18, [['13:00','13:30'],['13:30','14:00']], randomUUID())
    console.log(`  ✓ Bookings: Kevin Ct3 13–14, Lisa Ct4 13–14, Daniel Ct5 13–14, Emma Ct6 13–14`)

    await client.query('COMMIT')
    console.log('\n✅  Demo seed complete!\n')
    console.log('\n── Special dates ────────────────────────────────────────────')
    console.log(`  MAR 10 (Tue) Open Play 10–12, Afternoon Social 15–17`)
    console.log(`               Mei→Daniel 13–14 · James→Olivia 13–14`)
    console.log(`               4 bookings: Daniel Ct5, Olivia Ct6, Kevin Ct3, Lisa Ct4`)
    console.log(`  MAR 14 (Sat) FULLY BOOKED — social plays + coaching + bookings 12–18`)
    console.log(`  MAR 18 (Wed) Morning Play 09–11, Afternoon Social 14–16`)
    console.log(`               Sarah→Olivia 11–12 · Mei→Tom 11–12`)
    console.log(`               4 bookings: Kevin Ct3, Lisa Ct4, Daniel Ct5, Emma Ct6`)
    console.log('─────────────────────────────────────────────────────────────')
    console.log('\n── Weekly schedule overview ─────────────────────────────────')
    console.log(`  MON ${mon1}  Kevin books Court 4 16:00–17:30`)
    console.log(`               Monday Night Social 19:00–21:00 (Emma, Daniel, Olivia)`)
    console.log(`  TUE ${tueDates[0]}  Sarah → Tom 18:00–19:00 · James → Daniel 19:00–20:00`)
    console.log(`  WED ${wed1}  Lisa books Court 5 17:00–18:00`)
    console.log(`               James → Lisa coaching 18:30–19:30`)
    console.log(`  THU ${thu1}  Tom books Court 1 17:00–18:00`)
    console.log(`               Sarah → Emma coaching 19:00–20:00`)
    console.log(`  FRI ${fri1}  Mei → Olivia coaching 17:00–18:00`)
    console.log(`               Daniel books Court 4 18:00–19:00`)
    console.log(`  SAT ${sat1}  Mei → Kevin coaching 13:00–14:00  (+ fully packed day)`)
    console.log(`  SAT ${sat2}  Emma books Court 6 12:00–13:30`)
    console.log(`               Saturday Social Doubles 14:00–16:30 (Tom, Lisa, Kevin)`)
    console.log('─────────────────────────────────────────────────────────────')
    console.log('\n── Login credentials (password: Test1234) ───────────────────')
    console.log('  admin@ttclub.com  → admin')
    console.log('  sarah@ttclub.com  → coach  (Tom Tue, Emma Thu)')
    console.log('  james@ttclub.com  → coach  (Daniel Tue, Lisa Wed)')
    console.log('  mei@ttclub.com    → coach  (Olivia Fri, Kevin Sat)')
    console.log('  tom@ttclub.com    → member (booking Thu + coaching Tue + social Sat)')
    console.log('  lisa@ttclub.com   → member (booking Wed + coaching Wed + social Sat)')
    console.log('  kevin@ttclub.com  → member (booking Mon + coaching Sat + social Sat)')
    console.log('  emma@ttclub.com   → member (booking Sat + coaching Thu + social Mon)')
    console.log('  daniel@ttclub.com → member (booking Fri + coaching Tue + social Mon)')
    console.log('  olivia@ttclub.com → member (coaching Fri + social Mon)')
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
