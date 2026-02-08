-- Add extended vehicle parameters
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS crane_capacity_ton numeric,
  ADD COLUMN IF NOT EXISTS crane_reach_m numeric,
  ADD COLUMN IF NOT EXISTS vehicle_length_m numeric,
  ADD COLUMN IF NOT EXISTS vehicle_height_m numeric,
  ADD COLUMN IF NOT EXISTS vehicle_width_m numeric,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS daily_rate numeric,
  ADD COLUMN IF NOT EXISTS notes text;