
-- Disable all user triggers on bookings
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings DISABLE TRIGGER on_booking_delete_complete_projects;
ALTER TABLE public.bookings DISABLE TRIGGER set_org_id;
ALTER TABLE public.bookings DISABLE TRIGGER trg_sync_packing_on_booking_change;

-- Remove related data first
DELETE FROM public.booking_changes
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

DELETE FROM public.booking_products
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

DELETE FROM public.calendar_events
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

DELETE FROM public.booking_staff_assignments
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

DELETE FROM public.booking_attachments
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

DELETE FROM public.packing_projects
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE UPPER(status) != 'CONFIRMED'
    AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
);

-- Delete the bookings
DELETE FROM public.bookings
WHERE UPPER(status) != 'CONFIRMED'
  AND organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191';

-- Re-enable all triggers
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings ENABLE TRIGGER on_booking_delete_complete_projects;
ALTER TABLE public.bookings ENABLE TRIGGER set_org_id;
ALTER TABLE public.bookings ENABLE TRIGGER trg_sync_packing_on_booking_change;
