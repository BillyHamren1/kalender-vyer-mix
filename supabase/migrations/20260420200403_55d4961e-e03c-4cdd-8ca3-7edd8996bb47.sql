-- Generalize arrival_prompt_log to support all arrival target types
-- (location, project, booking) instead of being location-only.
--
-- Strategy:
--   * Keep existing location_id column for backwards compatibility with
--     historical rows and the (now legacy) location-only call paths.
--   * Add target_type + target_id as the new generic key.
--   * Backfill target_type/target_id from location_id for all existing rows.
--   * Replace the (staff_id, location_id, arrived_at) uniqueness assumption
--     with a generic (staff_id, target_type, target_id, arrived_at) index.

ALTER TABLE public.arrival_prompt_log
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid;

-- Backfill: existing rows are all location-arrivals.
UPDATE public.arrival_prompt_log
SET target_type = 'location',
    target_id = location_id
WHERE target_type IS NULL AND location_id IS NOT NULL;

-- Make location_id nullable now that target_id is the primary key for new rows.
ALTER TABLE public.arrival_prompt_log
  ALTER COLUMN location_id DROP NOT NULL;

-- Validation: target_type must be one of the three supported kinds.
ALTER TABLE public.arrival_prompt_log
  DROP CONSTRAINT IF EXISTS arrival_prompt_log_target_type_check;
ALTER TABLE public.arrival_prompt_log
  ADD CONSTRAINT arrival_prompt_log_target_type_check
    CHECK (target_type IN ('location', 'project', 'booking'));

-- New uniqueness: one open arrival per (staff, target, arrived_at).
CREATE UNIQUE INDEX IF NOT EXISTS arrival_prompt_log_staff_target_arrival_uidx
  ON public.arrival_prompt_log (staff_id, target_type, target_id, arrived_at);

-- Helpful lookup index for the generic get_arrival_state path.
CREATE INDEX IF NOT EXISTS arrival_prompt_log_staff_resolved_idx
  ON public.arrival_prompt_log (staff_id, resolved, target_type, target_id);

-- Document the new model.
COMMENT ON COLUMN public.arrival_prompt_log.target_type IS
  'Arrival target kind: location | project | booking. Replaces the location-only model.';
COMMENT ON COLUMN public.arrival_prompt_log.target_id IS
  'UUID of the target entity (organization_locations.id | large_projects.id | bookings.id).';
COMMENT ON COLUMN public.arrival_prompt_log.location_id IS
  'Legacy column — kept for backwards compatibility. Use target_id + target_type for new code.';
