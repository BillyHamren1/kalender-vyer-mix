ALTER TABLE public.warehouse_calendar_events
  DROP CONSTRAINT IF EXISTS warehouse_calendar_events_event_type_check;

ALTER TABLE public.warehouse_calendar_events
  ADD CONSTRAINT warehouse_calendar_events_event_type_check
  CHECK (
    event_type IN ('packing','delivery','event','return','inventory','unpacking','internal_task')
    OR event_type ~ '^(return|inventory|unpacking)_\d{4}-\d{2}-\d{2}$'
  );