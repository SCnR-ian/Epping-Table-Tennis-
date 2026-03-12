ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS availability_start DATE,
  ADD COLUMN IF NOT EXISTS availability_end   DATE,
  ADD COLUMN IF NOT EXISTS resume_filename    TEXT,
  ADD COLUMN IF NOT EXISTS resume_data        TEXT;
