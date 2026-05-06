const pool = require('../db')

/**
 * Checks whether a given date + time window falls within the club's open schedule.
 * Returns null if OK, or an error message string if the time is outside open hours.
 */
async function checkOpenHours(date, start_time, end_time, clubId = 1) {
  const { rows } = await pool.query(
    `SELECT day, start_time, end_time FROM schedule
     WHERE day = TO_CHAR($1::date, 'Dy') AND is_active = TRUE AND club_id = $2
     LIMIT 1`,
    [date, clubId]
  )

  const dayName = new Date(date + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

  if (!rows[0])
    return `The club is closed on ${dayName}. No activities can be booked.`

  const open  = rows[0].start_time.slice(0, 5)
  const close = rows[0].end_time.slice(0, 5)

  if (start_time < open || end_time > close)
    return `The club is only open ${open}–${close} on ${dayName}. Please choose a time within those hours.`

  return null
}

// ─── Court availability helpers ───────────────────────────────────────────────

function _toMins(t) {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}
function _minsToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`
}

async function getCourtCount(db, clubId) {
  const { rows: [{ total }] } = await db.query(
    'SELECT COUNT(*)::int AS total FROM courts WHERE club_id=$1 AND is_active=TRUE',
    [clubId]
  )
  return total || 1
}

/**
 * Returns the maximum concurrent court usage across each 30-min sub-slot
 * within [start_time, end_time] on the given date.
 *
 * Checking the whole window at once overcounts: sessions touching only the
 * first half and sessions touching only the second half both get included
 * even though they never overlap each other. Per-slot checking is correct.
 *
 * @param {object}   db          - node-postgres Pool or PoolClient
 * @param {string}   date        - YYYY-MM-DD
 * @param {string}   start_time  - HH:MM or HH:MM:SS
 * @param {string}   end_time    - HH:MM or HH:MM:SS
 * @param {number}   clubId
 * @param {number[]} excludeIds  - coaching_session IDs to exclude (being rescheduled)
 * @returns {{ maxUsed, totalCourts, detail }} maxUsed = peak concurrent courts in window
 */
async function maxConcurrentCourts(db, date, start_time, end_time, clubId = 1, excludeIds = []) {
  const totalCourts = await getCourtCount(db, clubId)
  const startMins = _toMins(start_time)
  const endMins   = _toMins(end_time)
  let maxUsed = 0
  let worstDetail = ''

  for (let t = startMins; t < endMins; t += 30) {
    const slotStart = _minsToTime(t)
    const slotEnd   = _minsToTime(t + 30)
    const { rows: [u] } = await db.query(
      `SELECT
         (SELECT COUNT(DISTINCT COALESCE(group_id::text, id::text)) FROM coaching_sessions
          WHERE date=$1 AND status='confirmed' AND club_id=$4
            AND NOT (id = ANY($5::int[]))
            AND start_time < $3::time AND end_time > $2::time) AS coaching,
         (SELECT COUNT(DISTINCT booking_group_id) FROM bookings
          WHERE date=$1 AND status='confirmed' AND club_id=$4
            AND start_time < $3::time AND end_time > $2::time) AS booking,
         (SELECT COALESCE(SUM(num_courts), 0) FROM social_play_sessions
          WHERE date=$1 AND status='open' AND club_id=$4
            AND start_time < $3::time AND end_time > $2::time) AS social`,
      [date, slotStart, slotEnd, clubId, excludeIds.length ? excludeIds : [0]]
    )
    const total = Number(u.coaching) + Number(u.booking) + Number(u.social)
    if (total > maxUsed) {
      maxUsed = total
      worstDetail = `(${u.coaching} coaching + ${u.booking} bookings + ${u.social} social = ${total}/${totalCourts} at ${slotStart.slice(0,5)})`
    }
  }
  return { maxUsed, totalCourts, detail: worstDetail }
}

module.exports = { checkOpenHours, getCourtCount, maxConcurrentCourts }
