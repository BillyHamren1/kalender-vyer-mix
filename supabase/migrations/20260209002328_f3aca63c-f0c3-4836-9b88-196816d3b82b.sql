-- Add transport_time and pickup_address columns to transport_assignments
ALTER TABLE public.transport_assignments
ADD COLUMN transport_time TEXT DEFAULT NULL,
ADD COLUMN pickup_address TEXT DEFAULT NULL;