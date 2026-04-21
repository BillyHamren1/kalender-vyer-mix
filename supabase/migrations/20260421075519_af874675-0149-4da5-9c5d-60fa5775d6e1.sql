-- Add address cache columns to staff_locations
ALTER TABLE public.staff_locations
  ADD COLUMN IF NOT EXISTS last_address text,
  ADD COLUMN IF NOT EXISTS last_address_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_address_lat double precision,
  ADD COLUMN IF NOT EXISTS last_address_lng double precision;

-- Trigger: invalidate cached address when staff has moved >100m from where the
-- address was resolved, OR when the cached address is older than 1 hour.
-- The reverse-geocode-staff edge function then fills NULLs back in.
CREATE OR REPLACE FUNCTION public.invalidate_stale_staff_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _meters double precision;
BEGIN
  -- If we don't have a cached address yet, nothing to invalidate.
  IF NEW.last_address IS NULL THEN
    RETURN NEW;
  END IF;

  -- Stale by time → invalidate
  IF NEW.last_address_at IS NULL OR NEW.last_address_at < now() - interval '1 hour' THEN
    NEW.last_address := NULL;
    NEW.last_address_at := NULL;
    NEW.last_address_lat := NULL;
    NEW.last_address_lng := NULL;
    RETURN NEW;
  END IF;

  -- Stale by distance (>100m from where the address was geocoded) → invalidate
  IF NEW.last_address_lat IS NOT NULL AND NEW.last_address_lng IS NOT NULL
     AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    -- Haversine, meters
    _meters := 2 * 6371000 * asin(sqrt(
      power(sin(radians((NEW.latitude - NEW.last_address_lat) / 2)), 2) +
      cos(radians(NEW.last_address_lat)) * cos(radians(NEW.latitude)) *
      power(sin(radians((NEW.longitude - NEW.last_address_lng) / 2)), 2)
    ));
    IF _meters > 100 THEN
      NEW.last_address := NULL;
      NEW.last_address_at := NULL;
      NEW.last_address_lat := NULL;
      NEW.last_address_lng := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_stale_staff_address ON public.staff_locations;
CREATE TRIGGER trg_invalidate_stale_staff_address
BEFORE INSERT OR UPDATE ON public.staff_locations
FOR EACH ROW EXECUTE FUNCTION public.invalidate_stale_staff_address();