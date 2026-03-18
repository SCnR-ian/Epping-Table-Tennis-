-- Add is_walkin flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_walkin BOOLEAN NOT NULL DEFAULT FALSE;

-- Insert 10 reusable walk-in placeholder accounts
INSERT INTO users (name, email, password_hash, role, is_walkin)
VALUES
  ('Walk-in 1',  'walkin1@internal',  'x', 'member', TRUE),
  ('Walk-in 2',  'walkin2@internal',  'x', 'member', TRUE),
  ('Walk-in 3',  'walkin3@internal',  'x', 'member', TRUE),
  ('Walk-in 4',  'walkin4@internal',  'x', 'member', TRUE),
  ('Walk-in 5',  'walkin5@internal',  'x', 'member', TRUE),
  ('Walk-in 6',  'walkin6@internal',  'x', 'member', TRUE),
  ('Walk-in 7',  'walkin7@internal',  'x', 'member', TRUE),
  ('Walk-in 8',  'walkin8@internal',  'x', 'member', TRUE),
  ('Walk-in 9',  'walkin9@internal',  'x', 'member', TRUE),
  ('Walk-in 10', 'walkin10@internal', 'x', 'member', TRUE)
ON CONFLICT (email) DO NOTHING;
