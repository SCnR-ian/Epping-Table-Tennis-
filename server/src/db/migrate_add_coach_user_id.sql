-- Link coach records to user accounts so coaches can log in.
-- Run: psql -U postgres -d ttclub -f server/src/db/migrate_add_coach_user_id.sql

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Each user can be linked to at most one coach record
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_user_id
  ON coaches (user_id)
  WHERE user_id IS NOT NULL;
