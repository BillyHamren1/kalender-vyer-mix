ALTER TABLE public.organization_locations
  ADD COLUMN IF NOT EXISTS geofence_mode text NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS geofence_polygon jsonb;

ALTER TABLE public.organization_locations
  DROP CONSTRAINT IF EXISTS organization_locations_geofence_mode_check;

ALTER TABLE public.organization_locations
  ADD CONSTRAINT organization_locations_geofence_mode_check
  CHECK (geofence_mode IN ('circle', 'polygon'));