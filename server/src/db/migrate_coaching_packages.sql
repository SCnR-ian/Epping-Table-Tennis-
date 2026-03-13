-- Each row represents one package purchase (default 10 sessions).
-- Total purchased = SUM of total_sessions per user.
-- Sessions used   = COUNT of confirmed coaching_sessions for that student.
CREATE TABLE IF NOT EXISTS coaching_packages (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL DEFAULT 10,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaching_packages_user ON coaching_packages (user_id);
