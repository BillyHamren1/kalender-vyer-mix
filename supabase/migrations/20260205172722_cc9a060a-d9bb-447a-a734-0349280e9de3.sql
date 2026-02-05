-- Step 1: Delete from booking_changes first
DELETE FROM booking_changes 
WHERE booking_id IN (SELECT id FROM bookings WHERE eventdate < '2026-01-01');