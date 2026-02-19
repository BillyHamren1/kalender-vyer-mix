
-- Rensa befintliga dubbletter i warehouse_calendar_events
-- Behåller den med lägst id (äldsta), tar bort alla övriga med samma booking_id + event_type + start_time
DELETE FROM warehouse_calendar_events a
USING warehouse_calendar_events b
WHERE a.booking_id = b.booking_id
  AND a.event_type = b.event_type
  AND a.start_time = b.start_time
  AND a.id > b.id;
