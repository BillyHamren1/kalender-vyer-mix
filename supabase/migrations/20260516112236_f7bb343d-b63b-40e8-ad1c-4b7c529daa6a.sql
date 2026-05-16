ALTER TABLE public.staff_location_history
  ADD COLUMN IF NOT EXISTS battery_level numeric NULL,
  ADD COLUMN IF NOT EXISTS battery_percent integer NULL,
  ADD COLUMN IF NOT EXISTS is_charging boolean NULL,
  ADD COLUMN IF NOT EXISTS battery_captured_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS battery_source text NULL;

ALTER TABLE public.staff_location_history
  DROP CONSTRAINT IF EXISTS staff_location_history_battery_level_range;
ALTER TABLE public.staff_location_history
  ADD CONSTRAINT staff_location_history_battery_level_range
  CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 1));

ALTER TABLE public.staff_location_history
  DROP CONSTRAINT IF EXISTS staff_location_history_battery_percent_range;
ALTER TABLE public.staff_location_history
  ADD CONSTRAINT staff_location_history_battery_percent_range
  CHECK (battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100));