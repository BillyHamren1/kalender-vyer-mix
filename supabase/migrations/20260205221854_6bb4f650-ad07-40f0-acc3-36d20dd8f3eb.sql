-- Delete packing_list_items first (foreign key constraint)
DELETE FROM packing_list_items 
WHERE packing_id IN (
  SELECT pp.id FROM packing_projects pp
  JOIN bookings b ON pp.booking_id = b.id
  WHERE b.eventdate < '2026-01-01'
);

-- Delete packing_projects for old bookings
DELETE FROM packing_projects 
WHERE booking_id IN (
  SELECT id FROM bookings WHERE eventdate < '2026-01-01'
);

-- Also delete orphan packing_projects (where booking no longer exists)
DELETE FROM packing_list_items 
WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id NOT IN (SELECT id FROM bookings)
);

DELETE FROM packing_projects 
WHERE booking_id NOT IN (SELECT id FROM bookings);