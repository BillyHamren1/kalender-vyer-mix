-- VARIANT A (VERIFIED_EXISTENCE_ONLY):
-- legacy warehouse-unikhet som TABLE CONSTRAINT.
ALTER TABLE public.warehouse_calendar_events
  ADD CONSTRAINT warehouse_calendar_events_booking_event_type_unique
  UNIQUE (booking_id, event_type);
