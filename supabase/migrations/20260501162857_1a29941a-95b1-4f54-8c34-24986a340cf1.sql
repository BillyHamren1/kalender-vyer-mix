ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS address_radius_meters integer,
  ADD COLUMN IF NOT EXISTS address_geofence_mode text,
  ADD COLUMN IF NOT EXISTS address_geofence_polygon jsonb;