-- Replace court_id (single) with num_courts (how many courts the session occupies).
-- Court assignment is automatic — courts 1…num_courts are reserved for the slot.
-- Run: psql "$DATABASE_URL" -f server/src/db/migrate_social_play_multi_courts.sql

-- 1. Add num_courts column (default 1 so existing rows are valid)
ALTER TABLE social_play_sessions
  ADD COLUMN IF NOT EXISTS num_courts INTEGER NOT NULL DEFAULT 1;

-- 2. Drop old court columns from whichever state the DB is in
ALTER TABLE social_play_sessions
  DROP COLUMN IF EXISTS court_id;

ALTER TABLE social_play_sessions
  DROP COLUMN IF EXISTS court_ids;
