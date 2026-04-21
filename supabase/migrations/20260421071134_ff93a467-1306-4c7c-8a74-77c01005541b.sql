-- Backfill: Jānis arrived at Holmträskvägen 19 (Westmans Uthyrning, booking
-- 74e895a8-29e1-4ad6-ad07-518d46bfb70b) at 08:24 local (06:24 UTC) when his
-- travel log ended, but the geofence prompt never auto-checked him in. The
-- new optimistic auto-checkin (deployed in this change) would have done this
-- automatically, so here we materialize the missing row manually.
INSERT INTO public.location_time_entries (
  organization_id, staff_id, booking_id, entry_date, entered_at, source
)
SELECT
  'f5e5cade-f08b-4833-a105-56461f15b191',
  'staff_1775736607429_xwuakyawz',
  '74e895a8-29e1-4ad6-ad07-518d46bfb70b',
  '2026-04-21'::date,
  '2026-04-21 06:24:00+00'::timestamptz,
  'auto_assigned'
WHERE NOT EXISTS (
  SELECT 1 FROM public.location_time_entries
  WHERE staff_id = 'staff_1775736607429_xwuakyawz'
    AND booking_id = '74e895a8-29e1-4ad6-ad07-518d46bfb70b'
    AND entry_date = '2026-04-21'::date
);