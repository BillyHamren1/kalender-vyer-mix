ALTER TABLE public.staff_presence_events DROP CONSTRAINT IF EXISTS staff_presence_events_event_type_check;
ALTER TABLE public.staff_presence_events ADD CONSTRAINT staff_presence_events_event_type_check
  CHECK (event_type IN ('arrival','departure','signal_lost','signal_resumed'));