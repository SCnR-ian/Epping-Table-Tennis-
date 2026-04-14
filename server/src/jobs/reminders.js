const cron = require('node-cron')
const pool = require('../db')

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTomorrowSydney() {
  const now = new Date()
  const sydneyNow = new Date(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }))
  sydneyNow.setDate(sydneyNow.getDate() + 1)
  const y = sydneyNow.getFullYear()
  const m = String(sydneyNow.getMonth() + 1).padStart(2, '0')
  const d = String(sydneyNow.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtTime(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

async function insertMessage(pool, senderId, recipientId, body) {
  const { rows } = await pool.query(
    `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [senderId, recipientId, body]
  )
  // Mark as read for sender so it doesn't show as unread in their inbox
  await pool.query(
    `INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [rows[0].id, senderId]
  )
}

// ── Main reminder function ────────────────────────────────────────────────────

async function sendReminders() {
  const tomorrow = getTomorrowSydney()
  console.log(`[reminders] Sending reminders for ${tomorrow}`)

  try {
    // Find an admin to send messages from
    const { rows: admins } = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    )
    if (!admins.length) {
      console.warn('[reminders] No admin user found — skipping.')
      return
    }
    const senderId = admins[0].id

    // ── 1. Solo coaching sessions ─────────────────────────────────────────────
    const { rows: solo } = await pool.query(`
      SELECT cs.student_id, cs.start_time, cs.end_time,
             u.name    AS student_name,
             co.name   AS coach_name,
             co.user_id AS coach_user_id
      FROM coaching_sessions cs
      JOIN users   u  ON u.id  = cs.student_id
      JOIN coaches co ON co.id = cs.coach_id
      WHERE cs.date = $1 AND cs.status = 'confirmed' AND cs.group_id IS NULL
    `, [tomorrow])

    // ── 2. Group coaching sessions ────────────────────────────────────────────
    const { rows: groups } = await pool.query(`
      SELECT
        cs.group_id, cs.coach_id, cs.start_time, cs.end_time,
        co.name                             AS coach_name,
        co.user_id                          AS coach_user_id,
        array_agg(cs.student_id ORDER BY u.name) AS student_ids,
        array_agg(u.name        ORDER BY u.name) AS student_names
      FROM coaching_sessions cs
      JOIN users   u  ON u.id  = cs.student_id
      JOIN coaches co ON co.id = cs.coach_id
      WHERE cs.date = $1 AND cs.status = 'confirmed' AND cs.group_id IS NOT NULL
      GROUP BY cs.group_id, cs.coach_id, cs.start_time, cs.end_time, co.name, co.user_id
    `, [tomorrow])

    // ── 3. Social play sessions ───────────────────────────────────────────────
    const { rows: social } = await pool.query(`
      SELECT
        sps.id, sps.title, sps.start_time, sps.end_time,
        array_agg(p.user_id) AS participant_ids
      FROM social_play_sessions sps
      JOIN social_play_participants p ON p.session_id = sps.id
      JOIN users u ON u.id = p.user_id
      WHERE sps.date = $1 AND sps.status = 'open' AND NOT u.is_walkin
      GROUP BY sps.id, sps.title, sps.start_time, sps.end_time
    `, [tomorrow])

    // ── Send student reminders ────────────────────────────────────────────────

    for (const s of solo) {
      await insertMessage(pool, senderId, s.student_id,
        `Reminder: You have a 1-on-1 coaching session tomorrow with Coach ${s.coach_name} at ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}.`
      )
    }

    for (const g of groups) {
      for (const studentId of g.student_ids) {
        await insertMessage(pool, senderId, studentId,
          `Reminder: You have a group coaching session tomorrow at ${fmtTime(g.start_time)}–${fmtTime(g.end_time)} with Coach ${g.coach_name}.`
        )
      }
    }

    for (const s of social) {
      for (const uid of s.participant_ids) {
        await insertMessage(pool, senderId, uid,
          `Reminder: Social play "${s.title}" is tomorrow at ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}. See you there!`
        )
      }
    }

    // ── Send coach reminders ──────────────────────────────────────────────────

    // Collect all sessions per coach user_id
    const coachLines = {}

    for (const s of solo) {
      if (!s.coach_user_id) continue
      if (!coachLines[s.coach_user_id]) coachLines[s.coach_user_id] = []
      coachLines[s.coach_user_id].push(`• ${s.student_name} (1-on-1) – ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`)
    }

    for (const g of groups) {
      if (!g.coach_user_id) continue
      if (!coachLines[g.coach_user_id]) coachLines[g.coach_user_id] = []
      const names = g.student_names.join(', ')
      coachLines[g.coach_user_id].push(`• ${names} (Group) – ${fmtTime(g.start_time)}–${fmtTime(g.end_time)}`)
    }

    for (const [coachUserId, lines] of Object.entries(coachLines)) {
      // Sort by time (lines start with "• Name – HH:MM")
      lines.sort()
      await insertMessage(pool, senderId, Number(coachUserId),
        `Your coaching schedule for tomorrow:\n${lines.join('\n')}`
      )
    }

    console.log(`[reminders] Done — solo: ${solo.length}, groups: ${groups.length}, social: ${social.length}`)
  } catch (err) {
    console.error('[reminders] Error sending reminders:', err.message)
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

cron.schedule('0 8 * * *', sendReminders, { timezone: 'Australia/Sydney' })
console.log('[reminders] Cron job scheduled: daily 8:00 AM Sydney time')

module.exports = { sendReminders }
