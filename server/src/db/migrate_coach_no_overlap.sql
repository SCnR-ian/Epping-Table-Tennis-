-- Prevent a coach from being scheduled for two sessions at the exact same start time.
-- The application-level check (start_time < end_time overlap logic) handles partial overlaps.
ALTER TABLE coaching_sessions
  ADD CONSTRAINT coaching_no_coach_overlap UNIQUE (coach_id, date, start_time);
