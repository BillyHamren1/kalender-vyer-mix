
-- Disable delete-tracking triggers temporarily
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings DISABLE TRIGGER on_booking_delete_complete_projects;

-- Delete related booking_changes first (non-cascading FK)
DELETE FROM public.booking_changes 
WHERE booking_id IN (
  SELECT id FROM public.bookings 
  WHERE UPPER(status) = 'OFFER' 
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

-- Delete the OFFER bookings
DELETE FROM public.bookings 
WHERE UPPER(status) = 'OFFER' 
  AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191';

-- Re-enable triggers
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings ENABLE TRIGGER on_booking_delete_complete_projects;
