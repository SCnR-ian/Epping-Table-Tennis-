-- Allow multiple students (and one coach) to share a court/time in group coaching.
-- Court and coach overlap uniqueness only applies to non-group sessions.
DROP INDEX IF EXISTS coaching_no_court_overlap;
CREATE UNIQUE INDEX coaching_no_court_overlap
  ON coaching_sessions (court_id, date, start_time)
  WHERE status = 'confirmed' AND group_id IS NULL;

DROP INDEX IF EXISTS coaching_no_coach_overlap;
CREATE UNIQUE INDEX coaching_no_coach_overlap
  ON coaching_sessions (coach_id, date, start_time)
  WHERE status = 'confirmed' AND group_id IS NULL;
