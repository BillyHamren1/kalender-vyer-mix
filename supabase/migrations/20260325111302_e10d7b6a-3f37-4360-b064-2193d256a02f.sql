-- Temporarily disable the sync trigger on calendar_events
ALTER TABLE calendar_events DISABLE TRIGGER USER;

INSERT INTO calendar_events (title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, organization_id)
SELECT 
  COALESCE(b.booking_number || ': ' || b.client, b.client),
  COALESCE(b.rig_start_time, (b.rigdaydate || 'T08:00:00')::timestamptz),
  COALESCE(b.rig_end_time, (b.rigdaydate || 'T14:00:00')::timestamptz),
  'team-1', 'rig', b.id, b.booking_number,
  COALESCE(NULLIF(CONCAT_WS(', ', b.deliveryaddress, b.delivery_city), ''), 'No address provided'),
  b.organization_id
FROM bookings b
WHERE UPPER(b.status) = 'CONFIRMED'
  AND b.rigdaydate IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM calendar_events ce WHERE ce.booking_id = b.id AND ce.event_type = 'rig');

INSERT INTO calendar_events (title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, organization_id)
SELECT 
  COALESCE(b.booking_number || ': ' || b.client, b.client),
  COALESCE(b.event_start_time, (b.eventdate || 'T08:00:00')::timestamptz),
  COALESCE(b.event_end_time, (b.eventdate || 'T14:00:00')::timestamptz),
  'team-11', 'event', b.id, b.booking_number,
  COALESCE(NULLIF(CONCAT_WS(', ', b.deliveryaddress, b.delivery_city), ''), 'No address provided'),
  b.organization_id
FROM bookings b
WHERE UPPER(b.status) = 'CONFIRMED'
  AND b.eventdate IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM calendar_events ce WHERE ce.booking_id = b.id AND ce.event_type = 'event');

INSERT INTO calendar_events (title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, organization_id)
SELECT 
  COALESCE(b.booking_number || ': ' || b.client, b.client),
  COALESCE(b.rigdown_start_time, (b.rigdowndate || 'T08:00:00')::timestamptz),
  COALESCE(b.rigdown_end_time, (b.rigdowndate || 'T14:00:00')::timestamptz),
  'team-1', 'rigDown', b.id, b.booking_number,
  COALESCE(NULLIF(CONCAT_WS(', ', b.deliveryaddress, b.delivery_city), ''), 'No address provided'),
  b.organization_id
FROM bookings b
WHERE UPPER(b.status) = 'CONFIRMED'
  AND b.rigdowndate IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM calendar_events ce WHERE ce.booking_id = b.id AND ce.event_type = 'rigDown');

-- Re-enable user triggers
ALTER TABLE calendar_events ENABLE TRIGGER USER;