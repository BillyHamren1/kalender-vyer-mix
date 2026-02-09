-- Add estimated_duration column to transport_assignments (in minutes)
ALTER TABLE public.transport_assignments
ADD COLUMN estimated_duration integer NULL;