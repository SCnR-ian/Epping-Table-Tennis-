-- ============================================================
-- Epping Table Tennis Club – PostgreSQL Schema
-- Run: psql -U postgres -d ttclub -f schema.sql
-- ============================================================

-- Users -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  password_hash VARCHAR(255),                     -- NULL for OAuth-only accounts
  phone         VARCHAR(30),
  role          VARCHAR(20)   NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  avatar_url    TEXT,
  google_id     VARCHAR(100)  UNIQUE,
  facebook_id   VARCHAR(100)  UNIQUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Courts ------------------------------------------------------
CREATE TABLE IF NOT EXISTS courts (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed courts
INSERT INTO courts (name, description) VALUES
  ('Court 1', 'Competition-grade table – Main hall'),
  ('Court 2', 'Competition-grade table – Main hall'),
  ('Court 3', 'Competition-grade table – Main hall'),
  ('Court 4', 'Training table – Side room'),
  ('Court 5', 'Training table – Side room'),
  ('Court 6', 'Casual table – Side room')
ON CONFLICT DO NOTHING;

-- Bookings ----------------------------------------------------
-- Each row is one 30-minute time slot.
-- Related slots (from a single booking session) share a booking_group_id.
-- end_time is always start_time + 30 minutes.
CREATE TABLE IF NOT EXISTS bookings (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  court_id          INTEGER      NOT NULL REFERENCES courts(id),
  date              DATE         NOT NULL,
  start_time        TIME         NOT NULL,
  end_time          TIME         NOT NULL,
  booking_group_id  UUID         NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'cancelled'
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT no_overlap        UNIQUE (court_id, date, start_time),
  CONSTRAINT user_no_double_book UNIQUE (user_id, date, start_time)
);

-- Tournaments -------------------------------------------------
CREATE TABLE IF NOT EXISTS tournaments (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(120) NOT NULL,
  date             DATE         NOT NULL,
  prize            VARCHAR(50),
  status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'open' | 'completed'
  max_participants INTEGER      NOT NULL DEFAULT 32,
  format           VARCHAR(50)  NOT NULL DEFAULT 'Singles',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tournament registrations ------------------------------------
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id            SERIAL PRIMARY KEY,
  tournament_id INTEGER     NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

-- Schedule ----------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule (
  id         SERIAL PRIMARY KEY,
  day        VARCHAR(10)  NOT NULL,
  start_time TIME         NOT NULL,
  end_time   TIME         NOT NULL,
  label      VARCHAR(80)  NOT NULL,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO schedule (day, start_time, end_time, label) VALUES
  ('Mon', '18:00', '22:00', 'Open Practice'),
  ('Tue', '18:00', '22:00', 'Coaching Session'),
  ('Wed', '17:00', '23:00', 'Competitive Play'),
  ('Sat', '09:00', '17:00', 'Weekend Open')
ON CONFLICT DO NOTHING;

-- Announcements -----------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(200) NOT NULL,
  body       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at for users ----------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
