
-- Add pickup coordinates to transport_assignments
ALTER TABLE public.transport_assignments
ADD COLUMN pickup_latitude double precision,
ADD COLUMN pickup_longitude double precision;
