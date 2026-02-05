-- Delete all booking_changes referencing old bookings
DELETE FROM booking_changes 
WHERE booking_id IN (SELECT id FROM bookings WHERE eventdate < '2026-01-01');