-- Update check constraint with additional vehicle types
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;

ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_type_check 
  CHECK (vehicle_type IN ('van', 'light_truck', 'pickup_crane', 'crane_15m', 'crane_jib_20m', 'body_truck', 'truck', 'trailer', 'trailer_13m', 'truck_trailer', 'crane_trailer', 'other'));