
-- Add per-vehicle-type pricing as JSONB on vehicles table
-- Format: {"crane_15m": {"hourly_rate": 1500, "daily_rate": 12000}, ...}
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS vehicle_type_rates JSONB DEFAULT '{}'::JSONB;
