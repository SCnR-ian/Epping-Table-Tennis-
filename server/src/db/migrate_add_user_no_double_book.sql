-- Migration: prevent a user from booking two courts at the same time
-- Run once against your existing database:
--   psql -d ttclub -f migrate_add_user_no_double_book.sql

ALTER TABLE bookings
  ADD CONSTRAINT user_no_double_book UNIQUE (user_id, date, start_time);
