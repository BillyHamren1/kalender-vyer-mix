-- Fix incorrect resource_id values in warehouse_calendar_events
UPDATE warehouse_calendar_events 
SET resource_id = 'warehouse' 
WHERE resource_id = 'warehouse-packing';