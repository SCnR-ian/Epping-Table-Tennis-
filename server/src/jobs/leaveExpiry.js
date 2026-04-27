const cron = require('node-cron')
const pool = require('../db')

function fmtDate(d) {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })
}
function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

async function expireLeaveRequests() {
  console.log('[leaveExpiry] Checking for expired leave requests…')
  try {
    const { rows: expired } = await pool.query(`
      SELECT slr.id, slr.session_id, slr.student_id, slr.club_id,
             cs.date, cs.start_time, cs.end_time,
             u.name AS student_name
      FROM session_leave_requests slr
      JOIN coaching_sessions cs ON cs.id = slr.session_id
      JOIN users u ON u.id = slr.student_id
      WHERE slr.status = 'approved'
        AND slr.expires_at < NOW()
    `)

    if (!expired.length) {
      console.log('[leaveExpiry] No expired requests found.')
      return
    }

    console.log(`[leaveExpiry] Found ${expired.length} expired request(s).`)

    for (const lr of expired) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Mark leave request as expired
        await client.query(
          `UPDATE session_leave_requests SET status='expired', resolved_at=NOW() WHERE id=$1`,
          [lr.id]
        )

        // Cancel the session
        await client.query(
          `UPDATE coaching_sessions SET status='cancelled' WHERE id=$1`,
          [lr.session_id]
        )

        await client.query('COMMIT')

        // Fetch admins for this club
        const { rows: admins } = await pool.query(
          `SELECT id FROM users WHERE role='admin' AND club_id=$1 ORDER BY id`, [lr.club_id]
        )
        const firstAdmin = admins[0]
        if (!firstAdmin) {
          console.warn(`[leaveExpiry] No admin found for club ${lr.club_id} — skipping notifications.`)
          continue
        }

        const timeRange = `${fmtTime(lr.start_time)} – ${fmtTime(lr.end_time)}`
        const dateStr = fmtDate(lr.date)

        // Notify student
        const studentMsg = `⏰ Your leave request for ${dateStr}, ${timeRange} has expired — you did not select a makeup time within 48 hours.\n\nYour session has been cancelled. Standard cancellation policy applies.`
        const { rows: [studentNote] } = await pool.query(
          `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id`,
          [firstAdmin.id, lr.student_id, studentMsg]
        )
        await pool.query(
          `INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [studentNote.id, firstAdmin.id]
        )

        // Notify all admins — sent from student so it appears in their conversation thread
        const adminMsg = `⏰ Leave request expired: ${lr.student_name}'s session on ${dateStr}, ${timeRange} — student did not pick a makeup slot within 48 hours. Session cancelled. Please review hour deductions.`
        for (const admin of admins) {
          const { rows: [adminNote] } = await pool.query(
            `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id`,
            [lr.student_id, admin.id, adminMsg]
          )
          await pool.query(
            `INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [adminNote.id, lr.student_id]
          )
          // Un-hide thread so the message surfaces in admin inbox
          await pool.query(
            `DELETE FROM message_thread_hidden
             WHERE (user_id=$1 AND other_user_id=$2) OR (user_id=$2 AND other_user_id=$1)`,
            [lr.student_id, admin.id]
          )
        }

        console.log(`[leaveExpiry] Request ${lr.id} expired — session ${lr.session_id} cancelled, ${lr.student_name} notified.`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`[leaveExpiry] Error processing request ${lr.id}:`, err.message)
      } finally {
        client.release()
      }
    }
  } catch (err) {
    console.error('[leaveExpiry] Fatal error:', err.message)
  }
}

// Run every 30 minutes
cron.schedule('*/30 * * * *', expireLeaveRequests)
console.log('[leaveExpiry] Cron job scheduled: every 30 minutes')

// Run once on startup to catch any requests that expired while server was down
;(async () => {
  try { await expireLeaveRequests() } catch (e) { console.error('[leaveExpiry] Startup check failed:', e.message) }
})()

module.exports = { expireLeaveRequests }
