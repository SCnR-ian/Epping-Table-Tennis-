-- Social Play Sessions
-- Admin opens a spare time slot on a specific court; members can join.
-- Run: psql "$DATABASE_URL" -f server/src/db/migrate_social_play.sql

CREATE TABLE IF NOT EXISTS social_play_sessions (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(120) NOT NULL DEFAULT 'Social Play',
  description TEXT,
  court_id    INTEGER      NOT NULL REFERENCES courts(id),
  date        DATE         NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  max_players INTEGER      NOT NULL DEFAULT 12,
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',  -- 'open' | 'cancelled'
  created_by  INTEGER      NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_play_participants (
  session_id  INTEGER     NOT NULL REFERENCES social_play_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_sessions_date   ON social_play_sessions (date);
CREATE INDEX IF NOT EXISTS idx_social_participants     ON social_play_participants (user_id);
