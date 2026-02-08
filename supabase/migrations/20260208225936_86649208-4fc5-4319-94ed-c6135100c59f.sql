-- Drop the existing check constraint on vehicle_type
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;

-- Add new check constraint with expanded vehicle types
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_type_check 
  CHECK (vehicle_type IN ('van', 'light_truck', 'pickup_crane', 'crane_15m', 'crane_jib_20m', 'body_truck', 'truck', 'trailer', 'other'));