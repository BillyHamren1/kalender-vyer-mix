-- Drop the constraint and recreate with ON DELETE CASCADE
ALTER TABLE booking_changes DROP CONSTRAINT IF EXISTS booking_changes_booking_id_fkey;

-- Delete orphan booking_changes first
DELETE FROM booking_changes WHERE booking_id NOT IN (SELECT id FROM bookings);

-- Delete booking_changes for old bookings
DELETE FROM booking_changes WHERE booking_id IN (SELECT id FROM bookings WHERE eventdate < '2026-01-01');