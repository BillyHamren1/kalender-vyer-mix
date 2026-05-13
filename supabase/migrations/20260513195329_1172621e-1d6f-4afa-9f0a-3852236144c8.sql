UPDATE public.calendar_events
SET resource_id = 'team-' || substring(resource_id from 5)
WHERE event_type = 'todo'
  AND resource_id ~ '^team[0-9]+$';