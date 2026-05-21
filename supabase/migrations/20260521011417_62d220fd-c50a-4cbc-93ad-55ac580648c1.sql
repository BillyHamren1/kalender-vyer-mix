ALTER TABLE public.staff_locations
  ADD COLUMN IF NOT EXISTS battery_percent integer,
  ADD COLUMN IF NOT EXISTS is_charging boolean;