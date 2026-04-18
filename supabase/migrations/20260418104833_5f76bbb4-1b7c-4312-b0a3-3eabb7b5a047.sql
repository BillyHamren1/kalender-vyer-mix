-- Generalisera location_time_entries till en samlad tabell för alla aktiva timer-typer.
-- Behåller bakåtkompatibilitet: location_id är nu nullable, men minst en av
-- (location_id, booking_id, large_project_id) måste vara satt.

ALTER TABLE public.location_time_entries
  ALTER COLUMN location_id DROP NOT NULL;

ALTER TABLE public.location_time_entries
  ADD COLUMN IF NOT EXISTS booking_id uuid NULL,
  ADD COLUMN IF NOT EXISTS large_project_id uuid NULL,
  ADD COLUMN IF NOT EXISTS client_dedupe_key text NULL;

-- Exakt en av de tre källtyperna måste vara satt
ALTER TABLE public.location_time_entries
  DROP CONSTRAINT IF EXISTS location_time_entries_exactly_one_source;
ALTER TABLE public.location_time_entries
  ADD CONSTRAINT location_time_entries_exactly_one_source
  CHECK (
    (CASE WHEN location_id      IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN booking_id       IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN large_project_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- En öppen timer per (staff, booking)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lte_one_open_per_staff_booking
  ON public.location_time_entries (staff_id, booking_id)
  WHERE exited_at IS NULL AND booking_id IS NOT NULL;

-- En öppen timer per (staff, large_project)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lte_one_open_per_staff_project
  ON public.location_time_entries (staff_id, large_project_id)
  WHERE exited_at IS NULL AND large_project_id IS NOT NULL;

-- Snabb uppslag av ALLA öppna timers för en staff (timer-restoration vid mount)
CREATE INDEX IF NOT EXISTS idx_lte_open_by_staff
  ON public.location_time_entries (staff_id, organization_id)
  WHERE exited_at IS NULL;

-- Idempotensstöd för optimistisk klient-sync (samma key → samma server-rad)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lte_client_dedupe
  ON public.location_time_entries (staff_id, client_dedupe_key)
  WHERE client_dedupe_key IS NOT NULL;

-- Default-värdet för source ändras inte (gps), men vi accepterar nu även
-- 'manual_job' och 'manual_project' utöver 'manual'/'gps'.
-- Inget enum, bara dokumenterat värdeschema.

COMMENT ON TABLE public.location_time_entries IS
  'Single source of truth for all active staff timers (location/booking/large_project). One of location_id/booking_id/large_project_id must be set. source values: gps, manual, manual_job, manual_project.';
COMMENT ON COLUMN public.location_time_entries.booking_id IS
  'Set when this entry represents a manual job timer for a specific booking.';
COMMENT ON COLUMN public.location_time_entries.large_project_id IS
  'Set when this entry represents a manual project timer for a large project.';
COMMENT ON COLUMN public.location_time_entries.client_dedupe_key IS
  'Stable per-start client key so retried optimistic syncs do not create duplicates.';