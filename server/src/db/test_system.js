/**
 * System integration test — runs directly against the database.
 * Creates isolated test data on a far-future date, verifies behaviour, then cleans up.
 *
 * Run from the project root:
 *   node server/src/db/test_system.js
 *
 * Or from the server/ directory:
 *   node src/db/test_system.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ─── Isolated test date (far future, won't clash with real data) ─────────────
const TEST_DATE    = '2099-12-01'
const TOTAL_COURTS = 6

// ─── Minimal assertion helpers ───────────────────────────────────────────────
let passed = 0, failed = 0

function pass(msg) { console.log(`  ✓ ${msg}`); passed++ }
function fail(msg) { console.error(`  ✗ FAIL: ${msg}`); failed++ }
function assert(ok, msg) { ok ? pass(msg) : fail(msg) }
function section(title) { console.log(`\n[${title}]`) }

// ─── Court-count helper (mirrors AdminDashboard countFreeAtSlot logic) ───────
function toMins(t) {
  const [h, m] = String(t).substring(0, 5).split(':').map(Number)
  return h * 60 + m
}
function countFree(bookings, coachingSessions, socialSessions, slotTime) {
  const slotMins = toMins(slotTime)
  const inSlot = ({ start_time, end_time }) =>
    slotMins >= toMins(start_time) && slotMins < toMins(end_time)

  const bookingCourts  = new Set(bookings.filter(inSlot).map(b => b.court_id)).size
  const coachingCourts = coachingSessions.filter(inSlot).length
  const socialCourts   = socialSessions.filter(inSlot).reduce((s, r) => s + (r.num_courts || 0), 0)
  return Math.max(0, TOTAL_COURTS - bookingCourts - coachingCourts - socialCourts)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect()
  let adminId, memberId, coachUserId, coachRecordId
  let court1, court2, bookingGroupId, coachingSessionId, socialSessionId

  console.log('='.repeat(55))
  console.log('  TT Club — System Integration Tests')
  console.log('='.repeat(55))

  try {
    // ── 1. Schema ──────────────────────────────────────────────────────────
    section('1  Schema checks')

    const requiredTables = [
      'users', 'courts', 'bookings',
      'coaches', 'coaching_sessions',
      'social_play_sessions', 'social_play_participants',
    ]
    for (const t of requiredTables) {
      const { rows } = await client.query(`SELECT to_regclass('public.${t}') AS r`)
      assert(rows[0].r !== null, `Table "${t}" exists`)
    }

    // coaches must have user_id
    const { rows: coachCols } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='coaches' AND column_name='user_id'`)
    assert(coachCols.length > 0, 'coaches.user_id column exists')

    // social_play_sessions must have num_courts (not the old court_id/court_ids)
    const { rows: spCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='social_play_sessions'`)
    const colNames = spCols.map(r => r.column_name)
    assert(colNames.includes('num_courts'),  'social_play_sessions has num_courts')
    assert(!colNames.includes('court_id'),   'social_play_sessions does NOT have old court_id')
    assert(!colNames.includes('court_ids'),  'social_play_sessions does NOT have old court_ids array')

    // courts table must have at least TOTAL_COURTS rows
    const { rows: courtRows } = await client.query('SELECT id FROM courts ORDER BY id')
    assert(courtRows.length >= TOTAL_COURTS,
      `${TOTAL_COURTS} courts exist in DB (found ${courtRows.length})`)
    court1 = courtRows[0]?.id
    court2 = courtRows[1]?.id

    // ── 2. Test data setup ─────────────────────────────────────────────────
    section('2  Test data setup')

    // Pre-clean any leftovers from a previous failed run (safe order: sessions → coaches → users)
    await pool.query(`DELETE FROM coaching_sessions WHERE date=$1`, [TEST_DATE])
    await pool.query(`DELETE FROM social_play_sessions  WHERE date=$1`, [TEST_DATE])
    await pool.query(`DELETE FROM bookings              WHERE date=$1`, [TEST_DATE])
    await pool.query(
      `DELETE FROM coaches WHERE user_id IN (
         SELECT id FROM users
         WHERE email IN ('_sysadmin@ttclub.test','_sysmember@ttclub.test','_syscoach@ttclub.test')
       )`)
    await pool.query(
      `DELETE FROM users WHERE email IN ('_sysadmin@ttclub.test','_sysmember@ttclub.test','_syscoach@ttclub.test')`)

    await client.query('BEGIN')

    const { rows: aRows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Sys Test Admin','_sysadmin@ttclub.test','x','admin')
       RETURNING id`)
    adminId = aRows[0].id

    const { rows: mRows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Sys Test Member','_sysmember@ttclub.test','x','member')
       RETURNING id`)
    memberId = mRows[0].id

    const { rows: cuRows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Sys Test Coach','_syscoach@ttclub.test','x','coach')
       RETURNING id`)
    coachUserId = cuRows[0].id

    // Plain INSERT — pre-clean above ensures no duplicate
    const { rows: crRows } = await client.query(
      `INSERT INTO coaches (name, user_id) VALUES ('Sys Test Coach', $1) RETURNING id`,
      [coachUserId])
    coachRecordId = crRows[0].id

    await client.query('COMMIT')
    pass(`Users created (admin=${adminId}, member=${memberId}, coach=${coachUserId})`)
    pass(`Coach record created (id=${coachRecordId})`)

    // ── 3. Regular booking ─────────────────────────────────────────────────
    section('3  Regular booking')
    await client.query('BEGIN')

    bookingGroupId = 'ffffffff-1111-1111-1111-111111111111'
    // 60-minute booking → 2 rows of 30 min each
    await client.query(
      `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
       VALUES ($1,$2,$3,'18:00:00','18:30:00',$4),
              ($1,$2,$3,'18:30:00','19:00:00',$4)`,
      [memberId, court1, TEST_DATE, bookingGroupId])
    pass(`Booking on court ${court1}: ${TEST_DATE} 18:00–19:00`)

    // Duplicate booking on same court+date+start_time should fail.
    // Use a SAVEPOINT so a failed INSERT doesn't abort the outer transaction.
    let dupRejected = false
    await client.query('SAVEPOINT dup_check')
    try {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,'18:00:00','18:30:00','aaaaaaaa-0000-0000-0000-000000000000')`,
        [adminId, court1, TEST_DATE])
      await client.query('RELEASE SAVEPOINT dup_check')
    } catch (e) {
      dupRejected = (e.code === '23505')
      await client.query('ROLLBACK TO SAVEPOINT dup_check')
    }
    assert(dupRejected, 'Duplicate booking (same court+date+time) correctly rejected')

    await client.query('COMMIT')

    // ── 4. Coaching session auto-assign ────────────────────────────────────
    section('4  Coaching session — auto-assign court')
    await client.query('BEGIN')

    // court1 is booked 18:00–19:00, so coaching 18:00–19:00 should get a different court
    const { rows: freeC } = await client.query(
      `SELECT c.id FROM courts c
       WHERE c.id NOT IN (
         SELECT cs2.court_id FROM coaching_sessions cs2
         WHERE cs2.date=$1 AND cs2.status='confirmed'
           AND cs2.start_time < $3::time AND cs2.end_time > $2::time
       )
       AND c.id NOT IN (
         SELECT b.court_id FROM bookings b
         WHERE b.date=$1 AND b.status='confirmed'
           AND b.start_time < $3::time AND b.end_time > $2::time
       )
       ORDER BY c.id LIMIT 1`,
      [TEST_DATE, '18:00', '19:00'])

    assert(freeC.length > 0, 'At least one court available for coaching 18:00–19:00')
    assert(freeC[0]?.id !== court1,
      `Auto-assigned court (${freeC[0]?.id}) differs from booked court (${court1})`)

    const assignedCourt = freeC[0]?.id ?? court2
    const { rows: csRows } = await client.query(
      `INSERT INTO coaching_sessions (coach_id, student_id, court_id, date, start_time, end_time)
       VALUES ($1,$2,$3,$4,'18:00:00','19:00:00') RETURNING id`,
      [coachRecordId, memberId, assignedCourt, TEST_DATE])
    coachingSessionId = csRows[0].id
    pass(`Coaching session inserted: court ${assignedCourt}, 18:00–19:00 (id=${coachingSessionId})`)

    // Trying a second coaching session at the same time should fail (no student overlap)
    let csConflict = false
    await client.query('SAVEPOINT cs_dup_check')
    try {
      await client.query(
        `INSERT INTO coaching_sessions (coach_id, student_id, court_id, date, start_time, end_time)
         VALUES ($1,$2,$3,$4,'18:00:00','19:00:00')`,
        [coachRecordId, memberId, assignedCourt, TEST_DATE])
      await client.query('RELEASE SAVEPOINT cs_dup_check')
    } catch (e) {
      csConflict = (e.code === '23505')
      await client.query('ROLLBACK TO SAVEPOINT cs_dup_check')
    }
    assert(csConflict, 'Duplicate coaching session (same student+date+start) correctly rejected')

    await client.query('COMMIT')

    // ── 5. Coaching blocks court in booking-availability query ─────────────
    section('5  Coaching court blocked in availability query')

    const { rows: coachBlock } = await client.query(
      `SELECT
         cs.court_id,
         (cs.start_time + gs * INTERVAL '30 minutes')       AS slot_start,
         (cs.start_time + (gs + 1) * INTERVAL '30 minutes') AS slot_end
       FROM coaching_sessions cs,
       LATERAL generate_series(
         0,
         EXTRACT(EPOCH FROM (cs.end_time - cs.start_time))::int / 1800 - 1
       ) AS gs
       WHERE cs.date=$1 AND cs.status='confirmed'`,
      [TEST_DATE])

    const blockedAt1800 = coachBlock.filter(r => String(r.slot_start).startsWith('18:00'))
    assert(blockedAt1800.length >= 1,
      `Coaching session generates ≥1 blocked slot at 18:00 (got ${blockedAt1800.length})`)
    assert(blockedAt1800.some(r => r.court_id === assignedCourt),
      `Court ${assignedCourt} is in coaching blocked slots`)

    // ── 6. Social play ─────────────────────────────────────────────────────
    section('6  Social play session')
    await client.query('BEGIN')

    const { rows: spInsert } = await client.query(
      `INSERT INTO social_play_sessions
         (title, num_courts, date, start_time, end_time, max_players, created_by)
       VALUES ('Test Social', 1, $1, '18:00:00', '19:00:00', 12, $2)
       RETURNING id`,
      [TEST_DATE, adminId])
    socialSessionId = spInsert[0].id
    pass(`Social play session created (id=${socialSessionId}, num_courts=1)`)

    // Social play blocks courts 1..num_courts
    const { rows: spBlock } = await client.query(
      `SELECT
         c.court_id,
         (sps.start_time + gs * INTERVAL '30 minutes')       AS slot_start,
         (sps.start_time + (gs + 1) * INTERVAL '30 minutes') AS slot_end
       FROM social_play_sessions sps,
       LATERAL generate_series(
         0,
         EXTRACT(EPOCH FROM (sps.end_time - sps.start_time))::int / 1800 - 1
       ) AS gs,
       LATERAL generate_series(1, sps.num_courts) AS c(court_id)
       WHERE sps.date=$1 AND sps.status='open'`,
      [TEST_DATE])

    const spAt1800 = spBlock.filter(r => String(r.slot_start).startsWith('18:00'))
    assert(spAt1800.length === 1, `Social play (1 court) generates 1 blocked slot at 18:00`)

    // Join / leave
    await client.query(
      `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
      [socialSessionId, memberId])
    const { rows: cnt } = await client.query(
      `SELECT COUNT(*)::int AS c FROM social_play_participants WHERE session_id=$1`,
      [socialSessionId])
    assert(cnt[0].c === 1, 'Member joined social play session')

    // Duplicate join → rejected
    let joinDup = false
    await client.query('SAVEPOINT join_dup_check')
    try {
      await client.query(
        `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1,$2)`,
        [socialSessionId, memberId])
      await client.query('RELEASE SAVEPOINT join_dup_check')
    } catch (e) {
      joinDup = (e.code === '23505')
      await client.query('ROLLBACK TO SAVEPOINT join_dup_check')
    }
    assert(joinDup, 'Duplicate join correctly rejected')

    // Leave
    await client.query(
      `DELETE FROM social_play_participants WHERE session_id=$1 AND user_id=$2`,
      [socialSessionId, memberId])
    const { rows: cnt2 } = await client.query(
      `SELECT COUNT(*)::int AS c FROM social_play_participants WHERE session_id=$1`,
      [socialSessionId])
    assert(cnt2[0].c === 0, 'Member left social play session')

    await client.query('COMMIT')

    // ── 7. Court-count formula (mirrors AdminDashboard countFreeAtSlot) ────
    section('7  Court-count formula — booking + coaching + social at 18:00')

    // Fetch all three data sources as the Bookings tab useEffect would
    const { rows: bRows } = await client.query(
      `SELECT court_id, start_time, end_time FROM bookings
       WHERE date=$1 AND status='confirmed'`, [TEST_DATE])
    const { rows: cRows } = await client.query(
      `SELECT court_id, start_time, end_time FROM coaching_sessions
       WHERE date=$1 AND status='confirmed'`, [TEST_DATE])
    const { rows: sRows } = await client.query(
      `SELECT num_courts, start_time, end_time FROM social_play_sessions
       WHERE date=$1 AND status='open'`, [TEST_DATE])

    const free1800 = countFree(bRows, cRows, sRows, '18:00')
    assert(free1800 === 3,
      `Courts left at 18:00 = 3 (booking + coaching + social each use 1) — got ${free1800}`)

    // Courts at 17:00 should still be 6 (nothing scheduled then)
    const free1700 = countFree(bRows, cRows, sRows, '17:00')
    assert(free1700 === 6, `Courts left at 17:00 = 6 (nothing booked) — got ${free1700}`)

    // ── 8. Social play with multiple courts ────────────────────────────────
    section('8  Social play with 3 courts reduces count by 3')
    await client.query('BEGIN')

    await client.query(
      `UPDATE social_play_sessions SET num_courts=3 WHERE id=$1`, [socialSessionId])
    await client.query('COMMIT')

    const { rows: sRows3 } = await client.query(
      `SELECT num_courts, start_time, end_time FROM social_play_sessions
       WHERE date=$1 AND status='open'`, [TEST_DATE])
    const freeWith3Social = countFree(bRows, cRows, sRows3, '18:00')
    assert(freeWith3Social === 1,
      `Courts left at 18:00 = 1 (booking:1 + coaching:1 + social:3 = 5 of 6) — got ${freeWith3Social}`)

    // Reset back to 1
    await client.query('BEGIN')
    await client.query(`UPDATE social_play_sessions SET num_courts=1 WHERE id=$1`, [socialSessionId])
    await client.query('COMMIT')

    // ── 9. All courts saturated → no coaching slot available ───────────────
    section('9  All courts full → coaching auto-assign returns empty')
    await client.query('BEGIN')

    // Fill all remaining courts at 20:00–20:30
    for (let i = 0; i < courtRows.length; i++) {
      await client.query(
        `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, booking_group_id)
         VALUES ($1,$2,$3,'20:00:00','20:30:00',$4) ON CONFLICT DO NOTHING`,
        [memberId, courtRows[i].id, TEST_DATE,
         `eeeeeeee-0000-0000-0000-${String(i).padStart(12, '0')}`])
    }
    await client.query('COMMIT')

    const { rows: noFree } = await client.query(
      `SELECT c.id FROM courts c
       WHERE c.id NOT IN (
         SELECT b.court_id FROM bookings b
         WHERE b.date=$1 AND b.status='confirmed'
           AND b.start_time < '20:30'::time AND b.end_time > '20:00'::time
       )
       AND c.id NOT IN (
         SELECT cs2.court_id FROM coaching_sessions cs2
         WHERE cs2.date=$1 AND cs2.status='confirmed'
           AND cs2.start_time < '20:30'::time AND cs2.end_time > '20:00'::time
       ) LIMIT 1`,
      [TEST_DATE])
    assert(noFree.length === 0, 'No court available at 20:00 when all 6 are booked')

    const freeAt2000 = countFree(
      [...bRows, ...courtRows.map((c, i) => ({
        court_id: c.id, start_time: '20:00:00', end_time: '20:30:00',
      }))],
      cRows, sRows, '20:00'
    )
    assert(freeAt2000 === 0, `Court count formula shows 0 free at 20:00`)

    // ── 10. Coach delete blocked when sessions exist ────────────────────────
    section('10 Coach with sessions cannot be deleted (RESTRICT)')

    let deleteBlocked = false
    try {
      await client.query(`DELETE FROM coaches WHERE id=$1`, [coachRecordId])
    } catch (e) {
      deleteBlocked = (e.code === '23503')   // foreign_key_violation
    }
    assert(deleteBlocked, 'Deleting coach with active sessions correctly blocked (FK RESTRICT)')

  } catch (err) {
    console.error('\nUnexpected test error:', err.message, err.stack)
    failed++
    await client.query('ROLLBACK').catch(() => {})
  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────────
    section('Cleanup')
    try {
      // Must delete in FK-safe order
      await pool.query(`DELETE FROM coaching_sessions WHERE date=$1`, [TEST_DATE])
      await pool.query(`DELETE FROM social_play_sessions WHERE date=$1`, [TEST_DATE])
      await pool.query(`DELETE FROM bookings WHERE date=$1`, [TEST_DATE])
      if (coachRecordId)
        await pool.query(`DELETE FROM coaches WHERE id=$1`, [coachRecordId])
      await pool.query(
        `DELETE FROM users WHERE email IN ('_sysadmin@ttclub.test','_sysmember@ttclub.test','_syscoach@ttclub.test')`)
      pass('Test data cleaned up')
    } catch (e) {
      fail(`Cleanup error: ${e.message}`)
    }

    client.release()
    await pool.end()

    // ── Summary ───────────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(55)}`)
    console.log(`  ${passed + failed} tests — ${passed} passed, ${failed} failed`)
    if (failed === 0) {
      console.log('  All tests passed ✓')
    } else {
      console.log('  Some tests FAILED ✗ — see ✗ lines above')
    }
    console.log('='.repeat(55))
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
