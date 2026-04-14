
ALTER TABLE public.large_projects
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_latitude double precision,
  ADD COLUMN IF NOT EXISTS address_longitude double precision;
