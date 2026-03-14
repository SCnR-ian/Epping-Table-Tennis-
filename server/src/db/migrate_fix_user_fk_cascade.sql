-- Fix FK constraints that blocked deleting a member.
-- social_play_sessions.created_by → SET NULL (session remains, just loses creator reference)
-- check_ins.checked_in_by        → SET NULL (check-in record remains, admin reference nulled)
-- Run: psql "$DATABASE_URL" -f server/src/db/migrate_fix_user_fk_cascade.sql

ALTER TABLE social_play_sessions
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS social_play_sessions_created_by_fkey,
  ADD CONSTRAINT social_play_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE check_ins
  DROP CONSTRAINT IF EXISTS check_ins_checked_in_by_fkey,
  ADD CONSTRAINT check_ins_checked_in_by_fkey
    FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL;
