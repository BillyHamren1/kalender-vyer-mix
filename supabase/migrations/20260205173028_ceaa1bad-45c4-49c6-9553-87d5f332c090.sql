-- Clean up ALL orphan booking_changes (where referenced booking doesn't exist)
DELETE FROM booking_changes WHERE booking_id NOT IN (SELECT id FROM bookings);

-- Re-add the FK constraint with ON DELETE CASCADE
ALTER TABLE booking_changes 
ADD CONSTRAINT booking_changes_booking_id_fkey 
FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;