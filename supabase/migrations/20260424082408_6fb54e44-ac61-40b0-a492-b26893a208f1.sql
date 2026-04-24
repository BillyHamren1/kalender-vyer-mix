-- Remove the auto-assignment triggers on calendar_events.
-- Staff assignments must only be created manually via the calendar UI.
DROP TRIGGER IF EXISTS sync_calendar_events_trigger ON public.calendar_events;
DROP TRIGGER IF EXISTS trigger_sync_booking_staff_on_calendar_event ON public.calendar_events;

-- Also remove the legacy mirror trigger from staff_assignments (the table is frozen).
DROP TRIGGER IF EXISTS sync_staff_assignments_trigger ON public.staff_assignments;
DROP TRIGGER IF EXISTS trigger_sync_booking_staff_on_staff_assignment ON public.staff_assignments;

-- The function is no longer used anywhere; drop it for clarity.
DROP FUNCTION IF EXISTS public.sync_booking_staff_assignments();