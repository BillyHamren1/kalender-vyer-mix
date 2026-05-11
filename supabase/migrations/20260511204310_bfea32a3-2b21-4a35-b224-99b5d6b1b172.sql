-- Add location-type + privacy fields to organization_locations
ALTER TABLE public.organization_locations
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS is_private_residence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_level text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allowed types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_locations_location_type_check'
  ) THEN
    ALTER TABLE public.organization_locations
      ADD CONSTRAINT organization_locations_location_type_check
      CHECK (location_type IN ('warehouse','project_site','customer_site','supplier','private_residence','other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_locations_privacy_level_check'
  ) THEN
    ALTER TABLE public.organization_locations
      ADD CONSTRAINT organization_locations_privacy_level_check
      CHECK (privacy_level IN ('normal','private'));
  END IF;
END$$;

-- Index for fast filtering on private residences
CREATE INDEX IF NOT EXISTS idx_organization_locations_private_residence
  ON public.organization_locations (organization_id)
  WHERE is_private_residence = true;

-- Validation trigger: private_residence must have polygon, not radius
CREATE OR REPLACE FUNCTION public.validate_organization_location_residence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.location_type = 'private_residence' OR NEW.is_private_residence = true THEN
    -- Force consistent flags
    NEW.is_private_residence := true;
    NEW.privacy_level := COALESCE(NULLIF(NEW.privacy_level,''), 'private');
    NEW.geofence_mode := 'polygon';
    -- Polygon required
    IF NEW.geofence_polygon IS NULL THEN
      RAISE EXCEPTION 'Boende (private_residence) kräver geofence_polygon';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_organization_location_residence ON public.organization_locations;
CREATE TRIGGER trg_validate_organization_location_residence
  BEFORE INSERT OR UPDATE ON public.organization_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_organization_location_residence();