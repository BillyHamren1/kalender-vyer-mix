-- Standardize all team IDs to team-1, team-2, etc. format

-- Update staff_assignments table
UPDATE staff_assignments
SET team_id = CASE team_id
  WHEN 'a' THEN 'team-1'
  WHEN 'b' THEN 'team-2'
  WHEN 'c' THEN 'team-3'
  WHEN 'd' THEN 'team-4'
  WHEN 'e' THEN 'team-5'
  WHEN 'f' THEN 'team-6'
  WHEN 'g' THEN 'team-7'
  WHEN 'h' THEN 'team-8'
  WHEN 'i' THEN 'team-9'
  WHEN 'j' THEN 'team-10'
  WHEN 'k' THEN 'team-11'
  ELSE team_id
END
WHERE team_id IN ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k');

-- Update booking_staff_assignments table
UPDATE booking_staff_assignments
SET team_id = CASE team_id
  WHEN 'a' THEN 'team-1'
  WHEN 'b' THEN 'team-2'
  WHEN 'c' THEN 'team-3'
  WHEN 'd' THEN 'team-4'
  WHEN 'e' THEN 'team-5'
  WHEN 'f' THEN 'team-6'
  WHEN 'g' THEN 'team-7'
  WHEN 'h' THEN 'team-8'
  WHEN 'i' THEN 'team-9'
  WHEN 'j' THEN 'team-10'
  WHEN 'k' THEN 'team-11'
  ELSE team_id
END
WHERE team_id IN ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k');

-- Re-sync booking_staff_assignments with standardized team IDs
TRUNCATE booking_staff_assignments;

INSERT INTO booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
SELECT DISTINCT 
  ce.booking_id,
  sa.staff_id,
  sa.team_id,
  sa.assignment_date
FROM staff_assignments sa
INNER JOIN calendar_events ce ON ce.resource_id = sa.team_id
  AND DATE(ce.start_time) = sa.assignment_date
WHERE ce.booking_id IS NOT NULL
ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;