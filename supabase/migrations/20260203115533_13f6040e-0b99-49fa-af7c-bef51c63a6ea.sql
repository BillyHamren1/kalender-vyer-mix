-- Remove duplicate warehouse events, keeping only the most recent one per booking/event_type
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY booking_id, event_type 
           ORDER BY created_at DESC
         ) as rn
  FROM warehouse_calendar_events
)
DELETE FROM warehouse_calendar_events
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);