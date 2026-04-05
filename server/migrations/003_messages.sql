CREATE TABLE IF NOT EXISTS messages (
  id            SERIAL PRIMARY KEY,
  sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = announcement to all
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created   ON messages(created_at DESC);
