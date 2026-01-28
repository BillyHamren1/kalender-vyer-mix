-- Temporarily disable the delete triggers
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_deletions;

-- Delete all bookings (all related data should already be deleted)
DELETE FROM public.bookings;

-- Re-enable the delete triggers
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_deletions;