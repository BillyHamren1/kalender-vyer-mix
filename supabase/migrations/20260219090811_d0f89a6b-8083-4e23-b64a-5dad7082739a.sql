
-- Step 1: Clean up existing duplicates in warehouse_calendar_events
-- Keep the row with the lowest id (earliest created)
DELETE FROM warehouse_calendar_events a
USING warehouse_calendar_events b
WHERE a.booking_id = b.booking_id
  AND a.event_type = b.event_type
  AND a.start_time = b.start_time
  AND a.id > b.id;

-- Step 2: Add UNIQUE constraint on warehouse_calendar_events to prevent future duplicates
ALTER TABLE warehouse_calendar_events
  ADD CONSTRAINT warehouse_calendar_events_booking_event_type_unique
  UNIQUE (booking_id, event_type);

-- Step 3: Add UNIQUE constraint on calendar_events to prevent future duplicates  
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_booking_id_event_type_unique
  UNIQUE (booking_id, event_type);
