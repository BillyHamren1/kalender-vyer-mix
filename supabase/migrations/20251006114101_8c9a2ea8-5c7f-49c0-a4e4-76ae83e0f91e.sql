-- Move all EVENT type calendar events to LIVE column (team-11) and remove prefix
UPDATE calendar_events
SET 
  resource_id = 'team-11',
  title = REPLACE(title, 'Event - ', '')
WHERE event_type = 'event'
AND resource_id = 'team-6';