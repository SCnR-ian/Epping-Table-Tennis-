-- ============================================================
-- Add check_ins table for member attendance tracking
-- Run: psql -U postgres -d ttclub -f server/src/db/migrate_add_checkin.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS check_ins (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'booking' | 'social' | 'coaching'
  type          VARCHAR(20)  NOT NULL,
  -- booking_group_id (UUID text) or session id (integer as text)
  reference_id  TEXT         NOT NULL,
  date          DATE         NOT NULL,
  checked_in_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- NULL = self check-in; populated when an admin checks someone in
  checked_in_by INTEGER      REFERENCES users(id),
  UNIQUE (user_id, type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins (date);
CREATE INDEX IF NOT EXISTS idx_check_ins_user ON check_ins (user_id, date);
