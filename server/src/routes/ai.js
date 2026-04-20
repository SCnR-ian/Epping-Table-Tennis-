const router  = require('express').Router()
const pool    = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return ''
  return new Date(d.slice ? d.slice(0,10)+'T12:00:00' : d)
    .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const str = typeof t === 'string' ? t : String(t)
  const [h, m] = str.substring(0, 5).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function todaySydney() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  // ── Members ──
  {
    name: 'list_members',
    description: 'List club members. Can filter by name or role.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by name (optional)' },
        role:   { type: 'string', description: 'Filter by role: member, coach, admin (optional)' },
      },
    },
  },
  {
    name: 'create_member',
    description: 'Create a new member account in the club.',
    input_schema: {
      type: 'object',
      properties: {
        name:     { type: 'string' },
        email:    { type: 'string' },
        password: { type: 'string', description: 'Initial password for the account' },
        phone:    { type: 'string', description: 'Optional phone number' },
      },
      required: ['name', 'email', 'password'],
    },
  },
  {
    name: 'update_member',
    description: 'Update a member\'s name or email.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'number' },
        name:    { type: 'string', description: 'New name (optional)' },
        email:   { type: 'string', description: 'New email (optional)' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'delete_member',
    description: 'Permanently delete a member account.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'number' },
      },
      required: ['user_id'],
    },
  },
  // ── Coaching ──
  {
    name: 'get_member_balance',
    description: 'Get a student\'s coaching hour/dollar balance.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'number', description: 'User ID of the student' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'add_balance',
    description: 'Add coaching balance (dollars) to a student account.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'number' },
        amount:  { type: 'number', description: 'Dollar amount to add (positive)' },
        note:    { type: 'string', description: 'Reason or note' },
      },
      required: ['user_id', 'amount'],
    },
  },
  {
    name: 'add_balance_all',
    description: 'Add coaching balance (dollars) to ALL members in one operation. Use this instead of calling add_balance repeatedly when the admin wants to top up everyone.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Dollar amount to add to every member' },
        note:   { type: 'string', description: 'Reason or note' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'list_coaches',
    description: 'List all coaches in the club.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_sessions',
    description: 'List coaching sessions for a date range or specific student/coach.',
    input_schema: {
      type: 'object',
      properties: {
        date_from:     { type: 'string', description: 'YYYY-MM-DD' },
        date_to:       { type: 'string', description: 'YYYY-MM-DD' },
        student_id:    { type: 'number' },
        coach_id:      { type: 'number', description: 'coaches table ID (from list_coaches coach_id field)' },
        coach_user_id: { type: 'number', description: 'user ID of the coach (alternative to coach_id)' },
        status:        { type: 'string', description: 'confirmed, cancelled, completed (optional, omit for all)' },
      },
    },
  },
  {
    name: 'create_session',
    description: 'Create a new coaching session for a student with a coach.',
    input_schema: {
      type: 'object',
      properties: {
        coach_id:      { type: 'number', description: 'coaches table ID (from list_coaches coach_id field)' },
        coach_user_id: { type: 'number', description: 'user ID of the coach — used if coach has no coach profile yet' },
        student_id:    { type: 'number' },
        date:          { type: 'string', description: 'YYYY-MM-DD' },
        start_time:    { type: 'string', description: 'HH:MM (24h)' },
        end_time:      { type: 'string', description: 'HH:MM (24h)' },
      },
      required: ['student_id', 'date', 'start_time', 'end_time'],
    },
  },
  {
    name: 'reschedule_session',
    description: 'Reschedule a coaching session to a new time on the same or different date.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'number' },
        date:       { type: 'string', description: 'YYYY-MM-DD — omit to keep same date' },
        start_time: { type: 'string', description: 'HH:MM (24h) new start time' },
        end_time:   { type: 'string', description: 'HH:MM (24h) new end time' },
      },
      required: ['session_id', 'start_time', 'end_time'],
    },
  },
  {
    name: 'cancel_session',
    description: 'Cancel a coaching session by session ID.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'number' },
      },
      required: ['session_id'],
    },
  },
  // ── Leave requests ──
  {
    name: 'list_leave_requests',
    description: 'List coaching session leave requests. Filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'pending, approved, rejected, rescheduled (default: pending)' },
      },
    },
  },
  {
    name: 'approve_leave_request',
    description: 'Approve a student leave request. Sends slot options to the student.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'number' },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'reject_leave_request',
    description: 'Reject a student leave request.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'number' },
      },
      required: ['request_id'],
    },
  },
  // ── Bookings ──
  {
    name: 'list_bookings',
    description: 'List confirmed court bookings. Filter by date or member name.',
    input_schema: {
      type: 'object',
      properties: {
        date:   { type: 'string', description: 'YYYY-MM-DD (optional, defaults to today)' },
        search: { type: 'string', description: 'Filter by member name (optional)' },
      },
    },
  },
  {
    name: 'cancel_booking',
    description: 'Cancel a court booking group by booking_group_id.',
    input_schema: {
      type: 'object',
      properties: {
        booking_group_id: { type: 'string', description: 'The booking group UUID' },
      },
      required: ['booking_group_id'],
    },
  },
  // ── Social Play ──
  {
    name: 'update_social_session',
    description: 'Update a single social play session (title, time, courts, max players).',
    input_schema: {
      type: 'object',
      properties: {
        session_id:  { type: 'number' },
        start_time:  { type: 'string', description: 'HH:MM (24h)' },
        end_time:    { type: 'string', description: 'HH:MM (24h)' },
        title:       { type: 'string' },
        num_courts:  { type: 'number' },
        max_players: { type: 'number' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'bulk_update_social_sessions',
    description: 'Update time for all upcoming social play sessions on a specific weekday. Use this when the admin wants to change the regular time for e.g. all Tuesday sessions.',
    input_schema: {
      type: 'object',
      properties: {
        weekday:    { type: 'string', description: 'Day of week: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday' },
        start_time: { type: 'string', description: 'New start time HH:MM (24h)' },
        end_time:   { type: 'string', description: 'New end time HH:MM (24h)' },
        title:      { type: 'string', description: 'New title (optional)' },
        num_courts: { type: 'number', description: 'New number of courts (optional)' },
      },
      required: ['weekday', 'start_time', 'end_time'],
    },
  },
  {
    name: 'list_social_sessions',
    description: 'List social play sessions. Defaults to upcoming sessions.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD — specific date (optional)' },
        include_past: { type: 'boolean', description: 'Include past sessions (default false)' },
      },
    },
  },
  {
    name: 'create_social_session',
    description: 'Create a social play session.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Session title (default: "Social Play")' },
        date:        { type: 'string', description: 'YYYY-MM-DD' },
        start_time:  { type: 'string', description: 'HH:MM (24h)' },
        end_time:    { type: 'string', description: 'HH:MM (24h)' },
        num_courts:  { type: 'number', description: 'Number of courts (default 2)' },
        max_players: { type: 'number', description: 'Max players (default 12)' },
        description: { type: 'string' },
      },
      required: ['date', 'start_time', 'end_time'],
    },
  },
  {
    name: 'cancel_social_session',
    description: 'Cancel a social play session by ID.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'number' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'add_member_to_social',
    description: 'Add a member to a social play session.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'number' },
        user_id:    { type: 'number' },
      },
      required: ['session_id', 'user_id'],
    },
  },
  {
    name: 'remove_member_from_social',
    description: 'Remove a member from a social play session.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'number' },
        user_id:    { type: 'number' },
      },
      required: ['session_id', 'user_id'],
    },
  },
  // ── Tournaments ──
  {
    name: 'list_tournaments',
    description: 'List all tournaments.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_tournament',
    description: 'Create a new tournament.',
    input_schema: {
      type: 'object',
      properties: {
        name:             { type: 'string' },
        date:             { type: 'string', description: 'YYYY-MM-DD' },
        format:           { type: 'string', description: 'Singles, Doubles, Teams (default: Singles)' },
        status:           { type: 'string', description: 'upcoming, ongoing, completed (default: upcoming)' },
        max_participants: { type: 'number', description: 'Max entrants (default 32)' },
        prize:            { type: 'string', description: 'Prize description (optional)' },
      },
      required: ['name', 'date'],
    },
  },
  {
    name: 'update_tournament',
    description: 'Update tournament details.',
    input_schema: {
      type: 'object',
      properties: {
        tournament_id:    { type: 'number' },
        name:             { type: 'string' },
        date:             { type: 'string', description: 'YYYY-MM-DD' },
        format:           { type: 'string' },
        status:           { type: 'string', description: 'upcoming, ongoing, completed' },
        max_participants: { type: 'number' },
        prize:            { type: 'string' },
      },
      required: ['tournament_id'],
    },
  },
  {
    name: 'delete_tournament',
    description: 'Delete a tournament by ID.',
    input_schema: {
      type: 'object',
      properties: {
        tournament_id: { type: 'number' },
      },
      required: ['tournament_id'],
    },
  },
  // ── Venue / Check-ins ──
  {
    name: 'get_venue_checkins',
    description: 'Get venue check-ins for a specific date (defaults to today).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD (optional, defaults to today)' },
      },
    },
  },
  // ── Announcements ──
  {
    name: 'list_announcements',
    description: 'List recent club announcements.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of announcements to return (default 10)' },
      },
    },
  },
  {
    name: 'send_announcement',
    description: 'Send an announcement to all club members.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body:  { type: 'string' },
      },
      required: ['title', 'body'],
    },
  },
  // ── Reports ──
  {
    name: 'get_dashboard_stats',
    description: 'Get overall club statistics: member count, booking count, tournament count.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_payment_report',
    description: 'Get coaching payment report for a period.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to:   { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name, input, clubId, adminId) {
  const bcrypt = require('bcryptjs')

  switch (name) {

    // ── Members ──────────────────────────────────────────────────────────────

    case 'list_members': {
      let q = `SELECT id, name, email, role FROM users WHERE club_id=$1 AND is_walkin IS NOT TRUE`
      const params = [clubId]
      if (input.search) { q += ` AND name ILIKE $${params.length+1}`; params.push(`%${input.search}%`) }
      if (input.role)   { q += ` AND role=$${params.length+1}`;       params.push(input.role) }
      q += ' ORDER BY name LIMIT 50'
      const { rows } = await pool.query(q, params)
      return rows.length ? rows.map(r => `${r.id}: ${r.name} (${r.role}) — ${r.email}`).join('\n')
                         : 'No members found.'
    }

    case 'create_member': {
      const hash = await bcrypt.hash(input.password, 12)
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (name, email, password_hash, phone, club_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email`,
          [input.name.trim(), input.email.toLowerCase().trim(), hash, input.phone?.trim() || null, clubId]
        )
        return `✅ Member created: ${rows[0].name} (ID ${rows[0].id}) — ${rows[0].email}`
      } catch (err) {
        if (err.code === '23505') return '❌ An account with that email already exists.'
        throw err
      }
    }

    case 'update_member': {
      const updates = [], values = []
      if (input.name?.trim())  { updates.push(`name=$${values.length+1}`);  values.push(input.name.trim()) }
      if (input.email?.trim()) { updates.push(`email=$${values.length+1}`); values.push(input.email.toLowerCase().trim()) }
      if (!updates.length) return '❌ Nothing to update — provide name or email.'
      values.push(input.user_id, clubId)
      try {
        const { rows } = await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id=$${values.length-1} AND club_id=$${values.length} RETURNING name, email`,
          values
        )
        return rows.length ? `✅ Updated: ${rows[0].name} — ${rows[0].email}` : '❌ Member not found.'
      } catch (err) {
        if (err.code === '23505') return '❌ That email is already in use.'
        throw err
      }
    }

    case 'delete_member': {
      if (String(input.user_id) === String(adminId)) return '❌ Cannot delete your own account.'
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1 AND club_id=$2`, [input.user_id, clubId])
      if (!u.length) return '❌ Member not found.'
      try {
        await pool.query(`DELETE FROM users WHERE id=$1 AND club_id=$2`, [input.user_id, clubId])
        return `✅ Deleted member: ${u[0].name}`
      } catch (err) {
        if (err.code === '23503') return '❌ Cannot delete: member has linked records (bookings, sessions, etc.).'
        throw err
      }
    }

    // ── Coaching ─────────────────────────────────────────────────────────────

    case 'get_member_balance': {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(delta),0) AS balance FROM coaching_hour_ledger WHERE user_id=$1 AND club_id=$2`,
        [input.user_id, clubId]
      )
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      const uname = u[0]?.name ?? `User ${input.user_id}`
      return `${uname}'s coaching balance: $${Number(rows[0].balance).toFixed(2)}`
    }

    case 'add_balance': {
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      const uname = u[0]?.name ?? `User ${input.user_id}`
      await pool.query(
        `INSERT INTO coaching_hour_ledger (user_id, delta, note, created_by, club_id) VALUES ($1,$2,$3,$4,$5)`,
        [input.user_id, input.amount, input.note ?? 'Added by admin', adminId, clubId]
      )
      return `✅ Added $${input.amount} to ${uname}'s balance.`
    }

    case 'add_balance_all': {
      const { rows: members } = await pool.query(
        `SELECT id FROM users WHERE club_id=$1 AND is_walkin IS NOT TRUE AND role='member'`,
        [clubId]
      )
      if (!members.length) return '❌ No members found.'
      const note = input.note ?? 'Bulk top-up by admin'
      await Promise.all(members.map(m =>
        pool.query(
          `INSERT INTO coaching_hour_ledger (user_id, delta, note, created_by, club_id) VALUES ($1,$2,$3,$4,$5)`,
          [m.id, input.amount, note, adminId, clubId]
        )
      ))
      return `✅ Added $${input.amount} to all ${members.length} members' balances.`
    }

    case 'list_coaches': {
      // Merge coaches table (has bio/availability) with users who have role='coach'
      const { rows } = await pool.query(
        `SELECT
           co.id        AS coach_id,
           COALESCE(co.name, u.name) AS name,
           u.id         AS user_id,
           u.email
         FROM users u
         LEFT JOIN coaches co ON co.user_id = u.id AND co.club_id = $1
         WHERE u.role = 'coach' AND u.club_id = $1 AND u.is_walkin IS NOT TRUE
         ORDER BY COALESCE(co.name, u.name)`,
        [clubId]
      )
      return rows.length
        ? rows.map(r => `${r.name} — user ID ${r.user_id}${r.coach_id ? `, coach ID ${r.coach_id}` : ' (no coach profile yet)'} — ${r.email}`).join('\n')
        : 'No coaches found.'
    }

    case 'list_sessions': {
      // Resolve coach_user_id → coach_id if needed
      let resolvedCoachId = input.coach_id
      if (!resolvedCoachId && input.coach_user_id) {
        const { rows: cr } = await pool.query(
          `SELECT id FROM coaches WHERE user_id=$1 AND club_id=$2`, [input.coach_user_id, clubId]
        )
        resolvedCoachId = cr[0]?.id ?? null
      }
      let q = `SELECT cs.id, cs.date, cs.start_time, cs.end_time, cs.status,
                      u.name AS student_name, co.name AS coach_name
               FROM coaching_sessions cs
               JOIN users u ON u.id=cs.student_id
               JOIN coaches co ON co.id=cs.coach_id
               WHERE cs.club_id=$1`
      const params = [clubId]
      if (input.date_from)   { q += ` AND cs.date >= $${params.length+1}`; params.push(input.date_from) }
      if (input.date_to)     { q += ` AND cs.date <= $${params.length+1}`; params.push(input.date_to) }
      if (input.student_id)  { q += ` AND cs.student_id=$${params.length+1}`; params.push(input.student_id) }
      if (resolvedCoachId)   { q += ` AND cs.coach_id=$${params.length+1}`; params.push(resolvedCoachId) }
      if (input.status)      { q += ` AND cs.status=$${params.length+1}`; params.push(input.status) }
      else                   { /* no status filter — return all statuses */ }
      q += ' ORDER BY cs.date, cs.start_time LIMIT 50'
      const { rows } = await pool.query(q, params)
      return rows.length
        ? rows.map(r => `[${r.id}] ${fmtDate(r.date)} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)} | ${r.student_name} w/ Coach ${r.coach_name} (${r.status})`).join('\n')
        : 'No sessions found.'
    }

    case 'create_session': {
      // Resolve coach: prefer coach_id, else look up by coach_user_id, else auto-create coach profile
      let coachId = input.coach_id
      let coachName = null
      if (!coachId && input.coach_user_id) {
        const { rows: cr } = await pool.query(
          `SELECT id, name FROM coaches WHERE user_id=$1 AND club_id=$2`, [input.coach_user_id, clubId]
        )
        if (cr[0]) {
          coachId = cr[0].id
          coachName = cr[0].name
        } else {
          // Auto-create coach profile from user
          const { rows: ur } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.coach_user_id])
          if (!ur[0]) return '❌ Coach user not found.'
          const { rows: newCoach } = await pool.query(
            `INSERT INTO coaches (user_id, name, club_id) VALUES ($1,$2,$3) RETURNING id, name`,
            [input.coach_user_id, ur[0].name, clubId]
          )
          coachId = newCoach[0].id
          coachName = newCoach[0].name
        }
      }
      if (!coachId) return '❌ Provide coach_id or coach_user_id.'
      const { rows: courts } = await pool.query(
        `SELECT id FROM courts WHERE club_id=$1 AND is_active=TRUE LIMIT 1`, [clubId]
      )
      if (!courts.length) return '❌ No courts available.'
      const { rows: inserted } = await pool.query(
        `INSERT INTO coaching_sessions (coach_id, student_id, date, start_time, end_time, court_id, status, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7) RETURNING id`,
        [coachId, input.student_id, input.date, input.start_time, input.end_time, courts[0].id, clubId]
      )
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.student_id])
      if (!coachName) {
        const { rows: co } = await pool.query(`SELECT name FROM coaches WHERE id=$1`, [coachId])
        coachName = co[0]?.name
      }
      return `✅ Session created (ID ${inserted[0].id}): ${coachName} teaching ${u[0]?.name} on ${fmtDate(input.date)} ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}.`
    }

    case 'reschedule_session': {
      const { rows: s } = await pool.query(
        `SELECT cs.*, co.name AS coach_name, u.name AS student_name
         FROM coaching_sessions cs
         JOIN coaches co ON co.id=cs.coach_id
         JOIN users u ON u.id=cs.student_id
         WHERE cs.id=$1 AND cs.club_id=$2`,
        [input.session_id, clubId]
      )
      if (!s.length) return `❌ Session ${input.session_id} not found.`
      const sess = s[0]
      const newDate = input.date ?? (typeof sess.date === 'string' ? sess.date.slice(0,10) : new Date(sess.date).toISOString().slice(0,10))
      await pool.query(
        `UPDATE coaching_sessions SET date=$1, start_time=$2, end_time=$3 WHERE id=$4`,
        [newDate, input.start_time, input.end_time, input.session_id]
      )
      return `✅ Rescheduled session ${input.session_id} (${sess.student_name} w/ Coach ${sess.coach_name}) to ${fmtDate(newDate)} ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}.`
    }

    case 'cancel_session': {
      const { rows } = await pool.query(
        `UPDATE coaching_sessions SET status='cancelled' WHERE id=$1 AND club_id=$2 RETURNING id`,
        [input.session_id, clubId]
      )
      return rows.length ? `✅ Session ${input.session_id} cancelled.` : `❌ Session not found.`
    }

    // ── Leave requests ────────────────────────────────────────────────────────

    case 'list_leave_requests': {
      const status = input.status || 'pending'
      const { rows } = await pool.query(
        `SELECT slr.id, slr.status, slr.reason, slr.created_at, slr.expires_at,
                u.name AS student_name,
                cs.date, cs.start_time, cs.end_time,
                co.name AS coach_name
         FROM session_leave_requests slr
         JOIN users u ON u.id = slr.student_id
         JOIN coaching_sessions cs ON cs.id = slr.session_id
         JOIN coaches co ON co.id = cs.coach_id
         WHERE slr.club_id=$1 AND slr.status=$2
         ORDER BY slr.created_at DESC LIMIT 20`,
        [clubId, status]
      )
      if (!rows.length) return `No ${status} leave requests.`
      return rows.map(r =>
        `[ID ${r.id}] ${r.student_name} — ${fmtDate(r.date)} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)} w/ ${r.coach_name}${r.reason ? `\n  Reason: ${r.reason}` : ''}`
      ).join('\n')
    }

    case 'approve_leave_request': {
      const { rows: [lr] } = await pool.query(
        `SELECT slr.*, u.name AS student_name FROM session_leave_requests slr
         JOIN users u ON u.id = slr.student_id
         WHERE slr.id=$1 AND slr.status='pending' AND slr.club_id=$2`,
        [input.request_id, clubId]
      )
      if (!lr) return '❌ Leave request not found or not pending.'
      await pool.query(
        `UPDATE session_leave_requests
         SET status='approved', expires_at=NOW() + INTERVAL '48 hours', resolved_by=$1
         WHERE id=$2`,
        [adminId, input.request_id]
      )
      return `✅ Approved leave request for ${lr.student_name}. Slot options sent to student (48h window).`
    }

    case 'reject_leave_request': {
      const { rows: [lr] } = await pool.query(
        `SELECT slr.*, u.name AS student_name FROM session_leave_requests slr
         JOIN users u ON u.id = slr.student_id
         WHERE slr.id=$1 AND slr.status='pending' AND slr.club_id=$2`,
        [input.request_id, clubId]
      )
      if (!lr) return '❌ Leave request not found or not pending.'
      await pool.query(
        `UPDATE session_leave_requests
         SET status='rejected', resolved_at=NOW(), resolved_by=$1
         WHERE id=$2`,
        [adminId, input.request_id]
      )
      return `✅ Rejected leave request for ${lr.student_name}.`
    }

    // ── Bookings ──────────────────────────────────────────────────────────────

    case 'list_bookings': {
      const date = input.date || todaySydney()
      let q = `SELECT b.booking_group_id, b.court_id, b.date, b.user_id,
                      MIN(b.start_time) AS start_time, MAX(b.end_time) AS end_time,
                      b.status, u.name AS user_name, c.name AS court_name
               FROM bookings b
               JOIN users u ON u.id = b.user_id
               JOIN courts c ON c.id = b.court_id
               WHERE b.status='confirmed' AND b.club_id=$1 AND b.date=$2`
      const params = [clubId, date]
      if (input.search) { q += ` AND u.name ILIKE $${params.length+1}`; params.push(`%${input.search}%`) }
      q += ' GROUP BY b.booking_group_id, b.court_id, b.date, b.user_id, b.status, u.name, c.name ORDER BY MIN(b.start_time)'
      const { rows } = await pool.query(q, params)
      if (!rows.length) return `No bookings on ${fmtDate(date)}.`
      return rows.map(r =>
        `${r.user_name} — ${r.court_name} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)} [group: ${r.booking_group_id}]`
      ).join('\n')
    }

    case 'cancel_booking': {
      const { rows } = await pool.query(
        `SELECT user_id FROM bookings WHERE booking_group_id=$1 AND status='confirmed' AND club_id=$2 LIMIT 1`,
        [input.booking_group_id, clubId]
      )
      if (!rows.length) return '❌ Booking not found.'
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [rows[0].user_id])
      await pool.query(
        `UPDATE bookings SET status='cancelled' WHERE booking_group_id=$1 AND club_id=$2`,
        [input.booking_group_id, clubId]
      )
      return `✅ Booking for ${u[0]?.name ?? 'member'} cancelled.`
    }

    // ── Social Play ───────────────────────────────────────────────────────────

    case 'update_social_session': {
      const updates = [], values = []
      if (input.start_time)  { updates.push(`start_time=$${values.length+1}`);  values.push(input.start_time) }
      if (input.end_time)    { updates.push(`end_time=$${values.length+1}`);    values.push(input.end_time) }
      if (input.title)       { updates.push(`title=$${values.length+1}`);       values.push(input.title) }
      if (input.num_courts)  { updates.push(`num_courts=$${values.length+1}`);  values.push(input.num_courts) }
      if (input.max_players) { updates.push(`max_players=$${values.length+1}`); values.push(input.max_players) }
      if (!updates.length) return '❌ Nothing to update.'
      values.push(input.session_id, clubId)
      const { rows } = await pool.query(
        `UPDATE social_play_sessions SET ${updates.join(', ')} WHERE id=$${values.length-1} AND club_id=$${values.length} RETURNING title, date`,
        values
      )
      return rows.length ? `✅ Updated social session "${rows[0].title}" on ${fmtDate(rows[0].date)}.` : '❌ Session not found.'
    }

    case 'bulk_update_social_sessions': {
      const dayMap = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 }
      const dow = dayMap[input.weekday.toLowerCase()]
      if (dow === undefined) return `❌ Invalid weekday: ${input.weekday}`
      const sets = [`start_time=$1`, `end_time=$2`]
      const values = [input.start_time, input.end_time]
      if (input.title)      { sets.push(`title=$${values.length+1}`);      values.push(input.title) }
      if (input.num_courts) { sets.push(`num_courts=$${values.length+1}`); values.push(input.num_courts) }
      values.push(dow, clubId)
      const { rowCount } = await pool.query(
        `UPDATE social_play_sessions
         SET ${sets.join(', ')}
         WHERE EXTRACT(DOW FROM date)=$${values.length-1}
           AND date >= CURRENT_DATE
           AND status = 'open'
           AND club_id=$${values.length}`,
        values
      )
      return rowCount
        ? `✅ Updated ${rowCount} upcoming ${input.weekday} social session${rowCount > 1 ? 's' : ''} to ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}.`
        : `No upcoming ${input.weekday} social sessions found.`
    }

    case 'list_social_sessions': {
      let q = `SELECT s.id, s.title, s.date, s.start_time, s.end_time,
                      s.num_courts, s.max_players, s.status,
                      COUNT(p.user_id)::int AS participant_count
               FROM social_play_sessions s
               LEFT JOIN social_play_participants p ON p.session_id = s.id
               WHERE s.club_id=$1`
      const params = [clubId]
      if (input.date) {
        q += ` AND s.date=$${params.length+1}`; params.push(input.date)
      } else if (!input.include_past) {
        q += ` AND s.date >= CURRENT_DATE`
      }
      q += ' GROUP BY s.id ORDER BY s.date, s.start_time LIMIT 30'
      const { rows } = await pool.query(q, params)
      if (!rows.length) return 'No social play sessions found.'
      return rows.map(r =>
        `[${r.id}] ${fmtDate(r.date)} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)} — ${r.title} | ${r.participant_count}/${r.max_players} players, ${r.num_courts} courts (${r.status})`
      ).join('\n')
    }

    case 'create_social_session': {
      const { rows: inserted } = await pool.query(
        `INSERT INTO social_play_sessions
           (title, description, num_courts, date, start_time, end_time, max_players, created_by, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          input.title || 'Social Play',
          input.description || null,
          input.num_courts || 2,
          input.date, input.start_time, input.end_time,
          input.max_players || 12,
          adminId, clubId,
        ]
      )
      return `✅ Social session created (ID ${inserted[0].id}): ${input.title || 'Social Play'} on ${fmtDate(input.date)} ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}.`
    }

    case 'cancel_social_session': {
      const { rows } = await pool.query(
        `UPDATE social_play_sessions SET status='cancelled' WHERE id=$1 AND club_id=$2 RETURNING title`,
        [input.session_id, clubId]
      )
      return rows.length ? `✅ Social session "${rows[0].title}" cancelled.` : '❌ Session not found.'
    }

    case 'add_member_to_social': {
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      if (!u.length) return '❌ Member not found.'
      try {
        await pool.query(
          `INSERT INTO social_play_participants (session_id, user_id) VALUES ($1, $2)`,
          [input.session_id, input.user_id]
        )
        return `✅ Added ${u[0].name} to social session ${input.session_id}.`
      } catch (err) {
        if (err.code === '23505') return `❌ ${u[0].name} is already in this session.`
        throw err
      }
    }

    case 'remove_member_from_social': {
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      const { rowCount } = await pool.query(
        `DELETE FROM social_play_participants WHERE session_id=$1 AND user_id=$2`,
        [input.session_id, input.user_id]
      )
      return rowCount ? `✅ Removed ${u[0]?.name ?? 'member'} from social session ${input.session_id}.`
                      : '❌ Participant not found in this session.'
    }

    // ── Tournaments ───────────────────────────────────────────────────────────

    case 'list_tournaments': {
      const { rows } = await pool.query(
        `SELECT t.id, t.name, t.date, t.format, t.status, t.max_participants,
                t.prize, COUNT(tr.id)::int AS registered
         FROM tournaments t
         LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
         WHERE t.club_id=$1
         GROUP BY t.id ORDER BY t.date DESC LIMIT 20`,
        [clubId]
      )
      if (!rows.length) return 'No tournaments found.'
      return rows.map(r =>
        `[${r.id}] ${r.name} — ${fmtDate(r.date)} | ${r.format} | ${r.registered}/${r.max_participants} registered (${r.status})${r.prize ? ` | Prize: ${r.prize}` : ''}`
      ).join('\n')
    }

    case 'create_tournament': {
      const { rows } = await pool.query(
        `INSERT INTO tournaments (name, date, prize, status, max_participants, format, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          input.name, input.date, input.prize || null,
          input.status || 'upcoming',
          input.max_participants || 32,
          input.format || 'Singles',
          clubId,
        ]
      )
      return `✅ Tournament created (ID ${rows[0].id}): ${input.name} on ${fmtDate(input.date)}.`
    }

    case 'update_tournament': {
      const { rows: cur } = await pool.query(
        `SELECT * FROM tournaments WHERE id=$1 AND club_id=$2`, [input.tournament_id, clubId]
      )
      if (!cur.length) return '❌ Tournament not found.'
      const t = cur[0]
      await pool.query(
        `UPDATE tournaments SET name=$1, date=$2, prize=$3, status=$4, max_participants=$5, format=$6 WHERE id=$7`,
        [
          input.name ?? t.name,
          input.date ?? t.date,
          input.prize ?? t.prize,
          input.status ?? t.status,
          input.max_participants ?? t.max_participants,
          input.format ?? t.format,
          input.tournament_id,
        ]
      )
      return `✅ Tournament ${input.tournament_id} updated.`
    }

    case 'delete_tournament': {
      const { rows: cur } = await pool.query(
        `SELECT name FROM tournaments WHERE id=$1 AND club_id=$2`, [input.tournament_id, clubId]
      )
      if (!cur.length) return '❌ Tournament not found.'
      await pool.query(`DELETE FROM tournaments WHERE id=$1`, [input.tournament_id])
      return `✅ Tournament "${cur[0].name}" deleted.`
    }

    // ── Venue / Check-ins ─────────────────────────────────────────────────────

    case 'get_venue_checkins': {
      const date = input.date || todaySydney()
      const { rows } = await pool.query(
        `SELECT u.name, vc.checked_in_at, vc.checked_out_at
         FROM venue_checkins vc JOIN users u ON u.id=vc.user_id
         WHERE vc.date=$1 AND vc.club_id=$2 ORDER BY vc.checked_in_at`,
        [date, clubId]
      )
      if (!rows.length) return `No venue check-ins on ${fmtDate(date)}.`
      return `Check-ins for ${fmtDate(date)}:\n` + rows.map(r =>
        `${r.name}: in ${fmtTime(r.checked_in_at)}${r.checked_out_at ? ' → out ' + fmtTime(r.checked_out_at) : ' (still here)'}`
      ).join('\n')
    }

    // ── Announcements ─────────────────────────────────────────────────────────

    case 'list_announcements': {
      const limit = Math.min(input.limit || 10, 30)
      const { rows } = await pool.query(
        `SELECT id, title, body, created_at FROM announcements WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2`,
        [clubId, limit]
      )
      if (!rows.length) return 'No announcements found.'
      return rows.map(r =>
        `[${r.id}] ${fmtDate(r.created_at)} — ${r.title}\n  ${r.body?.substring(0, 100)}${r.body?.length > 100 ? '…' : ''}`
      ).join('\n')
    }

    case 'send_announcement': {
      await pool.query(
        `INSERT INTO announcements (title, body, club_id) VALUES ($1, $2, $3)`,
        [input.title, input.body, clubId]
      )
      return `✅ Announcement sent: "${input.title}"`
    }

    // ── Reports ───────────────────────────────────────────────────────────────

    case 'get_dashboard_stats': {
      const [members, bookings, tournaments, sessions, social] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int FROM users WHERE role='member' AND club_id=$1 AND is_walkin IS NOT TRUE`, [clubId]),
        pool.query(`SELECT COUNT(*)::int FROM bookings WHERE status='confirmed' AND club_id=$1`, [clubId]),
        pool.query(`SELECT COUNT(*)::int FROM tournaments WHERE club_id=$1`, [clubId]),
        pool.query(`SELECT COUNT(*)::int FROM coaching_sessions WHERE status='confirmed' AND club_id=$1 AND date >= CURRENT_DATE`, [clubId]),
        pool.query(`SELECT COUNT(*)::int FROM social_play_sessions WHERE status='open' AND club_id=$1 AND date >= CURRENT_DATE`, [clubId]),
      ])
      return [
        `Members: ${members.rows[0].count}`,
        `Total confirmed bookings: ${bookings.rows[0].count}`,
        `Tournaments: ${tournaments.rows[0].count}`,
        `Upcoming coaching sessions: ${sessions.rows[0].count}`,
        `Upcoming social play sessions: ${social.rows[0].count}`,
      ].join('\n')
    }

    case 'get_payment_report': {
      const { rows } = await pool.query(
        `SELECT co.name AS coach_name, COUNT(*) AS sessions,
                SUM(EXTRACT(EPOCH FROM (cs.end_time::time - cs.start_time::time))/3600) AS hours
         FROM coaching_sessions cs
         JOIN coaches co ON co.id=cs.coach_id
         WHERE cs.date BETWEEN $1 AND $2 AND cs.status='confirmed' AND cs.club_id=$3
         GROUP BY co.name ORDER BY co.name`,
        [input.from, input.to, clubId]
      )
      if (!rows.length) return 'No sessions in that period.'
      return rows.map(r => `${r.coach_name}: ${r.sessions} sessions, ${Number(r.hours).toFixed(1)} hrs`).join('\n')
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────

router.post('/chat', requireAuth, requireAdmin, async (req, res) => {
  const { message, history = [] } = req.body
  if (!message?.trim()) return res.status(400).json({ message: 'No message provided.' })

  const clubId  = req.club?.id ?? 1
  const adminId = req.user.id
  const today   = todaySydney()

  const systemPrompt = `You are an AI assistant exclusively for a table tennis club management system.
Today's date is ${today}.

Your ONLY job is to help the admin manage this club. You have full access to all club features:
- Members: list, create, update, delete members
- Coaching: list/create/reschedule/cancel sessions, manage coach balances, payment reports
- Leave requests: list, approve, reject student leave requests
- Bookings: list court bookings, cancel bookings
- Social play: list/create/cancel social sessions, add/remove participants
- Tournaments: list/create/update/delete tournaments
- Venue: view check-in records for any date
- Announcements: list and send announcements
- Stats: dashboard overview

## How to handle requests
- ALWAYS call the appropriate tool first. NEVER answer from memory or assumptions.
- If the admin mentions a name (e.g. "Alex Bai"), call list_members to find their ID — never ask the admin for IDs.
- If the admin says "today's session" or "move to 7", call list_sessions to find the session first, then act on it.
- If a time like "7" or "7pm" is given without AM/PM context, assume PM (19:00) for coaching sessions.
- If the session duration is not specified, keep the same duration as the original session.
- Only ask the admin a clarifying question if you genuinely cannot determine the intent after using all relevant tools.

## CRITICAL — Data integrity
- NEVER fabricate, guess, or invent data. Every name, number, and record you mention MUST come directly from a tool result.
- If a tool returns empty results, say so plainly. Do NOT fill in with example names or hypothetical data.
- If you are unsure whether you have called a tool, call it again rather than guessing.

## Restrictions
- ONLY answer questions or perform actions directly related to managing this club.
- If the admin asks anything unrelated (general knowledge, coding, recipes, weather, personal advice, etc.), respond with exactly: "I can only help with club management tasks."
- Never make exceptions to this rule.

Always respond in the same language the admin uses (English or Traditional Chinese). Keep responses concise.`

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  try {
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    console.log(`[ai] stop_reason=${response.stop_reason}`)

    // Agentic loop: keep running tools until stop_reason is 'end_turn'
    while (response.stop_reason === 'tool_use') {
      const assistantMsg = { role: 'assistant', content: response.content }
      const toolResults  = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        console.log(`[ai] tool_call: ${block.name}`, JSON.stringify(block.input))
        const result = await executeTool(block.name, block.input, clubId, adminId)
        console.log(`[ai] tool_result (preview): ${String(result).substring(0, 120)}`)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      messages.push(assistantMsg)
      messages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        temperature: 0,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      })
      console.log(`[ai] stop_reason=${response.stop_reason}`)
    }

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    res.json({ reply: text })
  } catch (err) {
    console.error('[ai/chat]', err.message)
    res.status(500).json({ message: 'AI error: ' + err.message })
  }
})

module.exports = router
