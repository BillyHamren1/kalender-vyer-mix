-- VARIANT B (VERIFIED_EXISTENCE_ONLY):
-- legacy warehouse-unikhet som FRISTÅENDE UNIQUE INDEX (ingen constraint).
CREATE UNIQUE INDEX warehouse_calendar_events_booking_event_type_unique
  ON public.warehouse_calendar_events (booking_id, event_type);
