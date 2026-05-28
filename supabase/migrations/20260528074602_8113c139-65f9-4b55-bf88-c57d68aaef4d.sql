-- One-off data fix: restore missing rig calendar_events row for booking 2604-8
-- (Westmans Uthyrning). Lost when rigdaydate was changed 2026-06-04 → 2026-06-03
-- yesterday — phaseDaysWriter inserted a new row, but the import-bookings
-- reconciler deleted it as "stale" because the external API didn't yet know
-- about the local date change. Sticky team for this booking is team-4 (matches
-- the surviving rigDown row).
INSERT INTO public.calendar_events (
  booking_id,
  booking_number,
  title,
  start_time,
  end_time,
  event_type,
  delivery_address,
  resource_id,
  organization_id,
  source_date
)
SELECT
  b.id,
  b.booking_number,
  COALESCE(b.client, b.booking_number, 'Bokning'),
  b.rig_start_time,
  b.rig_end_time,
  'rig',
  NULLIF(CONCAT_WS(', ', b.deliveryaddress, b.delivery_city), ''),
  'team-4',
  b.organization_id,
  b.rigdaydate
FROM public.bookings b
WHERE b.booking_number = '2604-8'
  AND b.rigdaydate IS NOT NULL
  AND b.rig_start_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.calendar_events ce
    WHERE ce.booking_id = b.id
      AND ce.event_type = 'rig'
      AND ce.source_date = b.rigdaydate
  );