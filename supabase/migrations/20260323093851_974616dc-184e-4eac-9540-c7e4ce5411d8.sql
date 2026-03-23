
-- Add standalone project fields to projects table
-- These mirror booking fields so projects can be created without a booking

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client TEXT,
  ADD COLUMN IF NOT EXISTS deliveryaddress TEXT,
  ADD COLUMN IF NOT EXISTS delivery_city TEXT,
  ADD COLUMN IF NOT EXISTS delivery_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS delivery_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS eventdate DATE,
  ADD COLUMN IF NOT EXISTS rigdaydate DATE,
  ADD COLUMN IF NOT EXISTS rigdowndate DATE,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS internalnotes TEXT,
  ADD COLUMN IF NOT EXISTS rig_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rig_end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rigdown_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rigdown_end_time TIMESTAMPTZ;
