const pool = require('../db')

/**
 * Checks whether a given date + time window falls within the club's open schedule.
 * Returns null if OK, or an error message string if the time is outside open hours.
 */
async function checkOpenHours(date, start_time, end_time) {
  const { rows } = await pool.query(
    `SELECT day, start_time, end_time FROM schedule
     WHERE day = TO_CHAR($1::date, 'Dy') AND is_active = TRUE
     LIMIT 1`,
    [date]
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

module.exports = { checkOpenHours }
