-- Allow multiple students to share a court in group coaching sessions.
-- The court-overlap uniqueness check should only apply to non-group sessions.
DROP INDEX IF EXISTS coaching_no_court_overlap;

CREATE UNIQUE INDEX coaching_no_court_overlap
  ON coaching_sessions (court_id, date, start_time)
  WHERE status = 'confirmed' AND group_id IS NULL;
