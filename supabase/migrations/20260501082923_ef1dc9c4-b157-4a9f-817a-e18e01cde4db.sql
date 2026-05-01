DELETE FROM calendar_events ce
USING bookings b, projects p
WHERE ce.booking_id = b.id
  AND p.booking_id = b.id
  AND p.planning_status = 'needs_planning'
  AND ce.event_type <> 'activity';

DELETE FROM calendar_events ce
USING bookings b, large_projects lp
WHERE ce.booking_id = b.id
  AND b.large_project_id = lp.id
  AND lp.planning_status = 'needs_planning'
  AND ce.event_type <> 'activity';