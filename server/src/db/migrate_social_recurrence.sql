-- Add recurrence support to social play sessions
ALTER TABLE social_play_sessions
  ADD COLUMN IF NOT EXISTS recurrence_id UUID;

CREATE INDEX IF NOT EXISTS idx_social_sessions_recurrence
  ON social_play_sessions(recurrence_id);
