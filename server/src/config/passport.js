const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const pool = require("../db");

// ── Serialise / Deserialise (only used during the OAuth redirect flow) ──────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    done(null, rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// ── Helper: upsert an OAuth user ─────────────────────────────────────────────
async function findOrCreateOAuthUser({
  provider,
  providerId,
  name,
  email,
  avatarUrl,
}) {
  const idCol = `${provider}_id`;

  // 1. Try by OAuth id
  let { rows } = await pool.query(`SELECT * FROM users WHERE ${idCol}=$1`, [
    providerId,
  ]);
  if (rows[0]) return rows[0];

  // 2. Try by email (link accounts)
  if (email) {
    ({ rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]));
    if (rows[0]) {
      // Attach the OAuth id to the existing account
      const updated = await pool.query(
        `UPDATE users SET ${idCol}=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [providerId, rows[0].id],
      );
      return updated.rows[0];
    }
  }

  // 3. Create new user
  const insert = await pool.query(
    `INSERT INTO users (name, email, ${idCol}, avatar_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, email || null, providerId, avatarUrl || null],
  );
  return insert.rows[0];
}

console.log("=== GOOGLE ENV DEBUG ===");
console.log("CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("CALLBACK:", process.env.GOOGLE_CALLBACK_URL);
console.log("NODE_ENV:", process.env.NODE_ENV);
// ── Google ────────────────────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateOAuthUser({
          provider: "google",
          providerId: profile.id,
          name: profile.displayName,
          email: profile.emails?.[0]?.value,
          avatarUrl: profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    },
  ),
);

module.exports = passport;
