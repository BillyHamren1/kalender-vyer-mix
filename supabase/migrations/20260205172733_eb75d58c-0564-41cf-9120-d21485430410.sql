-- Step 2: Delete packing_list_items for old bookings
DELETE FROM packing_list_items 
WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IN (
    SELECT id FROM bookings WHERE eventdate < '2026-01-01'
  )
);