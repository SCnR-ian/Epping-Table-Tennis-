-- Add session_type to distinguish 1-on-1 vs group coaching hours
ALTER TABLE coaching_hour_ledger
  ADD COLUMN IF NOT EXISTS session_type VARCHAR(10) NOT NULL DEFAULT 'solo';
