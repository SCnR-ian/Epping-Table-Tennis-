-- Convert bookings unique constraints to partial indexes scoped to confirmed rows.
-- This allows the same slot to be re-booked after a cancellation (soft delete).

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlap;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS user_no_double_book;

CREATE UNIQUE INDEX IF NOT EXISTS no_overlap
  ON bookings (court_id, date, start_time)
  WHERE status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS user_no_double_book
  ON bookings (user_id, date, start_time)
  WHERE status = 'confirmed';
