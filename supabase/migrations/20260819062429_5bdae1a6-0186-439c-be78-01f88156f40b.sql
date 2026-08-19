DROP INDEX IF EXISTS public.calendar_events_booking_phase_date_uniq;

CREATE UNIQUE INDEX calendar_events_booking_phase_date_uniq
ON public.calendar_events (booking_id, event_type, source_date)
WHERE booking_id IS NOT NULL
  AND source_date IS NOT NULL
  AND event_type IN ('rig', 'event', 'rigDown');