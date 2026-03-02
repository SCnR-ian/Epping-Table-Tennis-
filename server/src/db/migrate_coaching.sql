-- ============================================================
-- Coaching Feature Migration
-- Run: psql -U postgres -d ttclub -f migrate_coaching.sql
-- ============================================================

-- Coaches ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaches (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name       VARCHAR(120) NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Coaching Sessions -----------------------------------------------
-- One row = one scheduled coaching block on one court.
-- start_time/end_time span the full block (e.g. 18:00–19:00).
-- recurrence_id links sessions created as a weekly batch (like booking_group_id).
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id             SERIAL PRIMARY KEY,
  coach_id       INTEGER     NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
  student_id     INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  court_id       INTEGER     NOT NULL REFERENCES courts(id),
  date           DATE        NOT NULL,
  start_time     TIME        NOT NULL,
  end_time       TIME        NOT NULL,
  notes          TEXT,
  recurrence_id  UUID,
  status         VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coaching_no_court_overlap   UNIQUE (court_id, date, start_time),
  CONSTRAINT coaching_no_student_overlap UNIQUE (student_id, date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_student
  ON coaching_sessions (student_id, date);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_date
  ON coaching_sessions (date);
