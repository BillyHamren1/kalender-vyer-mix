CREATE UNIQUE INDEX IF NOT EXISTS warehouse_calendar_events_org_booking_event_type_unique
  ON public.warehouse_calendar_events (organization_id, booking_id, event_type);

ALTER TABLE public.warehouse_calendar_events
  DROP CONSTRAINT IF EXISTS warehouse_calendar_events_booking_event_type_unique;

DROP INDEX IF EXISTS public.warehouse_calendar_events_booking_event_type_unique;