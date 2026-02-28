const { Pool, types } = require('pg')

// By default pg uses postgres-date which parses DATE columns as
// new Date(year, month, day) — LOCAL midnight, not UTC.
// In AEDT (UTC+11) this shifts the serialised UTC string back one day,
// so "2026-03-03" arrives at the client as "2026-03-02T13:00:00.000Z"
// and .slice(0,10) gives the wrong date.  Return the raw "YYYY-MM-DD"
// string instead so no timezone conversion happens.
types.setTypeParser(1082, val => val)   // DATE  → plain string
types.setTypeParser(1114, val => val)   // TIMESTAMP → plain string (avoid similar issue)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err)
})

module.exports = pool
