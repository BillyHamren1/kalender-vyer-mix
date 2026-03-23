-- Drop the FK constraint so standalone projects can use project-prefixed booking_ids in calendar_events
ALTER TABLE public.calendar_events DROP CONSTRAINT calendar_events_booking_id_fkey;