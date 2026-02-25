-- Migration: add booking_group_id to bookings
-- Run once against your existing database:
--   psql -U postgres -d ttclub -f migrate_add_booking_group_id.sql

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_group_id UUID;
