/**
 * Seed 10 test accounts (password = "Test1234" for all)
 * Roles: 1 admin, 3 coaches, 6 members
 *
 * Run from the server/ directory:
 *   node src/db/seed_test_users.js
 */
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const PASSWORD = 'Test1234'

const USERS = [
  { name: 'Admin User',   email: 'admin@ttclub.com',   phone: '0400000001', role: 'admin'  },
  { name: 'Sarah Chen',   email: 'sarah@ttclub.com',   phone: '0400000002', role: 'coach'  },
  { name: 'James Park',   email: 'james@ttclub.com',   phone: '0400000003', role: 'coach'  },
  { name: 'Mei Zhang',    email: 'mei@ttclub.com',     phone: '0400000004', role: 'coach'  },
  { name: 'Tom Wilson',   email: 'tom@ttclub.com',     phone: '0400000005', role: 'member' },
  { name: 'Lisa Nguyen',  email: 'lisa@ttclub.com',    phone: '0400000006', role: 'member' },
  { name: 'Kevin Patel',  email: 'kevin@ttclub.com',   phone: '0400000007', role: 'member' },
  { name: 'Emma Roberts', email: 'emma@ttclub.com',    phone: '0400000008', role: 'member' },
  { name: 'Daniel Kim',   email: 'daniel@ttclub.com',  phone: '0400000009', role: 'member' },
  { name: 'Olivia Brown', email: 'olivia@ttclub.com',  phone: '0400000010', role: 'member' },
]

const COACHES = [
  { email: 'sarah@ttclub.com', bio: 'National-level competitor, 10+ years coaching.' },
  { email: 'james@ttclub.com', bio: 'Specialises in defensive play and footwork drills.' },
  { email: 'mei@ttclub.com',   bio: 'Former state champion, focuses on junior development.' },
]

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12)
  console.log(`Hashing password "${PASSWORD}" (cost 12)…`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Insert users
    for (const u of USERS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET name=EXCLUDED.name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash
         RETURNING id, email, role`,
        [u.name, u.email, hash, u.phone, u.role]
      )
      console.log(`  ✓ ${rows[0].role.padEnd(6)} ${rows[0].email}  (id=${rows[0].id})`)
    }

    // Insert coaches and link user_id
    for (const c of COACHES) {
      const { rows: uRows } = await client.query(
        'SELECT id FROM users WHERE email=$1', [c.email]
      )
      if (!uRows[0]) continue
      const userId = uRows[0].id

      await client.query(
        `INSERT INTO coaches (name, bio, user_id)
         SELECT name, $1, $2 FROM users WHERE id=$2
         ON CONFLICT DO NOTHING`,
        [c.bio, userId]
      )
      console.log(`  ✓ Coach record linked → ${c.email}`)
    }

    await client.query('COMMIT')
    console.log('\nDone! All accounts use password: Test1234')
    console.log('\nQuick login reference:')
    console.log('  admin@ttclub.com   → admin')
    console.log('  sarah@ttclub.com   → coach')
    console.log('  james@ttclub.com   → coach')
    console.log('  mei@ttclub.com     → coach')
    console.log('  tom@ttclub.com     → member')
    console.log('  lisa@ttclub.com    → member  (+ 4 more members)')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
