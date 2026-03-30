require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { Pool } = require('pg')
const bcrypt = require('bcrypt')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const STUDENTS = [
  'Yankai',
  'Alex Bai',
  'Issac (Jennifer)',
  'Olivia Xiao',
  'Zachary',
  'Yuvaan',
  'Samuel',
  'Jessie Ji',
  'Rossie (Victor)',
  'Jaden Yang',
  'Issac Wong',
  'Patrick',
  'Alan (小欢)',
  'Aaron (学军)',
  'Max Mengze Li',
  'Eliana',
  'Dylan',
  'Abby and Jasmine',
  'Yoo',
  'Brighton',
  'William',
  'Kimi (Lina)',
  'Karen',
  'Shayna',
  'Max Ren',
  'Janice (Lili)',
  'Choy Family',
  'Torres / Austin Hui',
]

const DEFAULT_PASSWORD = 'Epping2025!'

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12)
  let added = 0, skipped = 0

  for (const name of STUDENTS) {
    // Generate a unique placeholder email from the name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/, '')
    const email = `${slug}@eppingttclub.com.au`

    try {
      await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
        [name, email, hash]
      )
      console.log(`✓ Added: ${name} <${email}>`)
      added++
    } catch (err) {
      if (err.code === '23505') {
        console.log(`– Skipped (already exists): ${name}`)
        skipped++
      } else {
        console.error(`✗ Error for ${name}:`, err.message)
      }
    }
  }

  console.log(`\nDone. Added: ${added}, Skipped: ${skipped}`)
  await pool.end()
}

main()
