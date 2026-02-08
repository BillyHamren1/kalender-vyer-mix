-- Add column to store which vehicle types a transport partner provides
ALTER TABLE public.vehicles 
ADD COLUMN provided_vehicle_types text[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN public.vehicles.provided_vehicle_types IS 'Array of vehicle type keys that an external transport partner can provide';