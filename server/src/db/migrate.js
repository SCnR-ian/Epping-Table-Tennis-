// Run with: node src/db/migrate.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })
const fs   = require('fs')
const path = require('path')
const pool = require('./index')

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  try {
    await pool.query(sql)
    console.log('✅  Database schema applied successfully.')
  } catch (err) {
    console.error('❌  Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
