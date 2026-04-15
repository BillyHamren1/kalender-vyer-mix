
-- One-time data fix: set assigned_to_project = true for all bookings
-- that have an active job, project, or large project link

UPDATE bookings b
SET assigned_to_project = true
WHERE b.assigned_to_project = false
AND (
  EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id AND j.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM projects p WHERE p.booking_id = b.id AND p.status NOT IN ('cancelled'))
  OR EXISTS (SELECT 1 FROM large_project_bookings lpb WHERE lpb.booking_id = b.id)
);
