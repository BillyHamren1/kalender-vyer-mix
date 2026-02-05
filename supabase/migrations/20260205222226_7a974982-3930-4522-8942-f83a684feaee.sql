-- Delete packing_list_items for packing_projects with NULL eventdate or eventdate < 2026-01-01
DELETE FROM packing_list_items 
WHERE packing_id IN (
  SELECT pp.id FROM packing_projects pp
  LEFT JOIN bookings b ON pp.booking_id = b.id
  WHERE b.eventdate IS NULL OR b.eventdate < '2026-01-01'
);

-- Delete packing_projects with NULL eventdate or eventdate < 2026-01-01
DELETE FROM packing_projects 
WHERE id IN (
  SELECT pp.id FROM packing_projects pp
  LEFT JOIN bookings b ON pp.booking_id = b.id
  WHERE b.eventdate IS NULL OR b.eventdate < '2026-01-01'
);