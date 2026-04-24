-- Drop existing unique constraints/indexes that block multiple activities per booking/day
ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS uq_calendar_event_identity;
ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS unique_booking_event_time;
DROP INDEX IF EXISTS public.uq_calendar_event_identity;
DROP INDEX IF EXISTS public.unique_booking_event_time;

-- Recreate as PARTIAL unique indexes that exclude activities
CREATE UNIQUE INDEX uq_calendar_event_identity
  ON public.calendar_events (booking_id, event_type, source_date, organization_id)
  WHERE event_type IS DISTINCT FROM 'activity' AND booking_id IS NOT NULL;

CREATE UNIQUE INDEX unique_booking_event_time
  ON public.calendar_events (booking_id, event_type, start_time)
  WHERE event_type IS DISTINCT FROM 'activity' AND booking_id IS NOT NULL;