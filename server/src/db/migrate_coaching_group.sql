-- ============================================================
-- Group Coaching Migration
-- Run: psql -U postgres -d ttclub -f migrate_coaching_group.sql
-- ============================================================

-- 1. Add group_id column (links all students in one group coaching session)
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS group_id UUID;

-- 2. Drop old table constraints / indexes (recreating as partial)
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_court_overlap;
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_coach_overlap;
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_student_overlap;
DROP INDEX IF EXISTS coaching_no_court_overlap;
DROP INDEX IF EXISTS coaching_no_coach_overlap;
DROP INDEX IF EXISTS coaching_no_student_overlap;

-- 3. Court and coach overlap only apply to one-on-one sessions (group_id IS NULL).
--    Group sessions intentionally share the same coach+court+time across multiple rows.
CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_court_overlap
  ON coaching_sessions (court_id, date, start_time)
  WHERE status = 'confirmed' AND group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_coach_overlap
  ON coaching_sessions (coach_id, date, start_time)
  WHERE status = 'confirmed' AND group_id IS NULL;

-- 4. A student still cannot be in two sessions simultaneously regardless of type.
CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_student_overlap
  ON coaching_sessions (student_id, date, start_time)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_group
  ON coaching_sessions (group_id)
  WHERE group_id IS NOT NULL;
