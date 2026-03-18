CREATE TABLE IF NOT EXISTS coaching_hour_ledger (
  id          SERIAL        PRIMARY KEY,
  user_id     INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       DECIMAL(6,2)  NOT NULL,   -- positive = credit, negative = debit
  note        TEXT,
  session_id  INTEGER       REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  created_by  INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chl_user ON coaching_hour_ledger(user_id);
