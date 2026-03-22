CREATE TABLE IF NOT EXISTS group_session_leaves (
  id         SERIAL  PRIMARY KEY,
  group_id   UUID    NOT NULL,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  leave_date DATE    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, student_id)   -- one leave per student per group series
);

CREATE INDEX IF NOT EXISTS idx_group_leaves_group ON group_session_leaves (group_id);
