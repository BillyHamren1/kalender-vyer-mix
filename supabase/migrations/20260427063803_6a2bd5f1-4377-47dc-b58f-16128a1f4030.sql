-- Add geofence columns to large_projects (mirror organization_locations model)
ALTER TABLE public.large_projects
  ADD COLUMN IF NOT EXISTS address_radius_meters integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS address_geofence_mode text NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS address_geofence_polygon jsonb;

-- Constrain mode values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'large_projects_address_geofence_mode_chk'
  ) THEN
    ALTER TABLE public.large_projects
      ADD CONSTRAINT large_projects_address_geofence_mode_chk
      CHECK (address_geofence_mode IN ('circle','polygon'));
  END IF;
END $$;