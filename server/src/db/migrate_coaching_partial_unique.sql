-- Replace full unique constraints on coaching_sessions with partial unique indexes
-- that only enforce uniqueness among confirmed (non-cancelled) sessions.
-- This allows re-scheduling on the same slot after a cancellation.

-- Drop existing constraints (created in migrate_coaching.sql and migrate_coach_no_overlap.sql)
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_court_overlap;
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_student_overlap;
ALTER TABLE coaching_sessions DROP CONSTRAINT IF EXISTS coaching_no_coach_overlap;

-- Re-create as partial unique indexes scoped to confirmed sessions only
CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_court_overlap
  ON coaching_sessions (court_id, date, start_time)
  WHERE status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_student_overlap
  ON coaching_sessions (student_id, date, start_time)
  WHERE status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS coaching_no_coach_overlap
  ON coaching_sessions (coach_id, date, start_time)
  WHERE status = 'confirmed';
