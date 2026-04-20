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
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function todaySydney() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
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
        date_from:  { type: 'string', description: 'YYYY-MM-DD' },
        date_to:    { type: 'string', description: 'YYYY-MM-DD' },
        student_id: { type: 'number' },
        coach_id:   { type: 'number' },
      },
    },
  },
  {
    name: 'create_session',
    description: 'Create a new coaching session for a student with a coach.',
    input_schema: {
      type: 'object',
      properties: {
        coach_id:   { type: 'number' },
        student_id: { type: 'number' },
        date:       { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM (24h)' },
        end_time:   { type: 'string', description: 'HH:MM (24h)' },
      },
      required: ['coach_id', 'student_id', 'date', 'start_time', 'end_time'],
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
  {
    name: 'get_today_checkins',
    description: 'Get who has checked in today at the venue.',
    input_schema: { type: 'object', properties: {} },
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
  switch (name) {

    case 'list_members': {
      let q = `SELECT id, name, email, role FROM users WHERE club_id=$1`
      const params = [clubId]
      if (input.search) { q += ` AND name ILIKE $${params.length+1}`; params.push(`%${input.search}%`) }
      if (input.role)   { q += ` AND role=$${params.length+1}`;       params.push(input.role) }
      q += ' ORDER BY name LIMIT 50'
      const { rows } = await pool.query(q, params)
      return rows.length ? rows.map(r => `${r.id}: ${r.name} (${r.role}) — ${r.email}`).join('\n')
                         : 'No members found.'
    }

    case 'get_member_balance': {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(delta),0) AS balance FROM coaching_hour_ledger WHERE user_id=$1 AND club_id=$2`,
        [input.user_id, clubId]
      )
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      const name = u[0]?.name ?? `User ${input.user_id}`
      return `${name}'s coaching balance: $${Number(rows[0].balance).toFixed(2)}`
    }

    case 'add_balance': {
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.user_id])
      const name = u[0]?.name ?? `User ${input.user_id}`
      await pool.query(
        `INSERT INTO coaching_hour_ledger (user_id, delta, note, created_by, club_id) VALUES ($1,$2,$3,$4,$5)`,
        [input.user_id, input.amount, input.note ?? 'Added by admin', adminId, clubId]
      )
      return `✅ Added $${input.amount} to ${name}'s balance.`
    }

    case 'list_coaches': {
      const { rows } = await pool.query(
        `SELECT co.id, co.name, u.email FROM coaches co LEFT JOIN users u ON u.id=co.user_id WHERE co.club_id=$1 ORDER BY co.name`,
        [clubId]
      )
      return rows.length ? rows.map(r => `Coach ID ${r.id}: ${r.name}${r.email ? ` (${r.email})` : ''}`).join('\n')
                         : 'No coaches found.'
    }

    case 'list_sessions': {
      let q = `SELECT cs.id, cs.date, cs.start_time, cs.end_time, cs.status,
                      u.name AS student_name, co.name AS coach_name
               FROM coaching_sessions cs
               JOIN users u ON u.id=cs.student_id
               JOIN coaches co ON co.id=cs.coach_id
               WHERE cs.club_id=$1`
      const params = [clubId]
      if (input.date_from)  { q += ` AND cs.date >= $${params.length+1}`; params.push(input.date_from) }
      if (input.date_to)    { q += ` AND cs.date <= $${params.length+1}`; params.push(input.date_to) }
      if (input.student_id) { q += ` AND cs.student_id=$${params.length+1}`; params.push(input.student_id) }
      if (input.coach_id)   { q += ` AND cs.coach_id=$${params.length+1}`; params.push(input.coach_id) }
      q += ' ORDER BY cs.date, cs.start_time LIMIT 30'
      const { rows } = await pool.query(q, params)
      return rows.length
        ? rows.map(r => `[${r.id}] ${fmtDate(r.date)} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)} | ${r.student_name} w/ Coach ${r.coach_name} (${r.status})`).join('\n')
        : 'No sessions found.'
    }

    case 'create_session': {
      // Find an available court
      const { rows: courts } = await pool.query(
        `SELECT id FROM courts WHERE club_id=$1 AND is_active=TRUE LIMIT 1`, [clubId]
      )
      if (!courts.length) return '❌ No courts available.'
      const { rows: inserted } = await pool.query(
        `INSERT INTO coaching_sessions (coach_id, student_id, date, start_time, end_time, court_id, status, club_id)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7) RETURNING id`,
        [input.coach_id, input.student_id, input.date, input.start_time, input.end_time, courts[0].id, clubId]
      )
      const { rows: u } = await pool.query(`SELECT name FROM users WHERE id=$1`, [input.student_id])
      const { rows: co } = await pool.query(`SELECT name FROM coaches WHERE id=$1`, [input.coach_id])
      return `✅ Session created (ID ${inserted[0].id}): ${co[0]?.name} teaching ${u[0]?.name} on ${fmtDate(input.date)} ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}.`
    }

    case 'cancel_session': {
      const { rows } = await pool.query(
        `UPDATE coaching_sessions SET status='cancelled' WHERE id=$1 AND club_id=$2 RETURNING id`,
        [input.session_id, clubId]
      )
      return rows.length ? `✅ Session ${input.session_id} cancelled.` : `❌ Session not found.`
    }

    case 'get_today_checkins': {
      const today = todaySydney()
      const { rows } = await pool.query(
        `SELECT u.name, vc.checked_in_at, vc.checked_out_at
         FROM venue_checkins vc JOIN users u ON u.id=vc.user_id
         WHERE vc.date=$1 AND vc.club_id=$2 ORDER BY vc.checked_in_at`,
        [today, clubId]
      )
      if (!rows.length) return 'No one has checked in today yet.'
      return rows.map(r =>
        `${r.name}: in ${fmtTime(r.checked_in_at)}${r.checked_out_at ? ' → out '+fmtTime(r.checked_out_at) : ' (still here)'}`
      ).join('\n')
    }

    case 'send_announcement': {
      await pool.query(
        `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, NULL, $2)`,
        [adminId, `📢 ${input.title}\n\n${input.body}`]
      )
      return `✅ Announcement sent: "${input.title}"`
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

  const systemPrompt = `You are an AI assistant for a table tennis club management system.
Today's date is ${today}.
You help the admin manage the club by performing operations through tools.
When you use a tool, briefly explain what you're doing. After getting a tool result, summarise it clearly in plain language.
Always respond in the same language the admin uses (English or Traditional Chinese).
Keep responses concise and friendly.`

  // Build messages array from history + new message
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  try {
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    // Agentic loop: keep running tools until stop_reason is 'end_turn'
    while (response.stop_reason === 'tool_use') {
      const assistantMsg = { role: 'assistant', content: response.content }
      const toolResults  = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const result = await executeTool(block.name, block.input, clubId, adminId)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      messages.push(assistantMsg)
      messages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      })
    }

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    res.json({ reply: text })
  } catch (err) {
    console.error('[ai/chat]', err.message)
    res.status(500).json({ message: 'AI error: ' + err.message })
  }
})

module.exports = router
