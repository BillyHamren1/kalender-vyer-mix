-- Revert bulk migration: reset assigned_to_project for bookings
-- that have NO active jobs, projects, or large project links
UPDATE bookings b
SET assigned_to_project = false, assigned_project_id = NULL, assigned_project_name = NULL
WHERE b.assigned_to_project = true
AND b.status = 'CONFIRMED'
AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id AND j.deleted_at IS NULL AND j.status NOT IN ('completed','cancelled'))
AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.booking_id = b.id AND p.status NOT IN ('completed','cancelled'))
AND NOT EXISTS (SELECT 1 FROM large_project_bookings lpb WHERE lpb.booking_id = b.id);