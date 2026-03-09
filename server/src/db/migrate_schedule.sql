-- Update club open hours to match actual operating schedule.
-- Weekdays (Mon/Tue/Wed): 15:30 – 20:30
-- Saturday: 12:00 – 18:00
-- Run: psql -U postgres -d ttclub -f server/src/db/migrate_schedule.sql

UPDATE schedule SET start_time = '15:30', end_time = '20:30', label = 'Open Practice'  WHERE day = 'Mon';
UPDATE schedule SET start_time = '15:30', end_time = '20:30', label = 'Open Practice'  WHERE day = 'Tue';
UPDATE schedule SET start_time = '15:30', end_time = '20:30', label = 'Open Practice'  WHERE day = 'Wed';
UPDATE schedule SET start_time = '12:00', end_time = '18:00', label = 'Weekend Open'   WHERE day = 'Sat';
