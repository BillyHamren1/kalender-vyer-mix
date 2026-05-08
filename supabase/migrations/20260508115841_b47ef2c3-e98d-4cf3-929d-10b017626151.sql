
-- 1) Function: kopiera booking-coords/adress till projects om projektet saknar dem
CREATE OR REPLACE FUNCTION public.inherit_booking_coords_to_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bara om projektet saknar koord/adress — skriv aldrig över manuella värden
  IF NEW.delivery_latitude IS NOT NULL
     AND NEW.delivery_longitude IS NOT NULL
     AND NEW.deliveryaddress IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT delivery_latitude, delivery_longitude, deliveryaddress,
         delivery_city, delivery_postal_code
    INTO b
    FROM public.bookings
   WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_latitude IS NULL AND b.delivery_latitude IS NOT NULL THEN
    NEW.delivery_latitude := b.delivery_latitude;
  END IF;
  IF NEW.delivery_longitude IS NULL AND b.delivery_longitude IS NOT NULL THEN
    NEW.delivery_longitude := b.delivery_longitude;
  END IF;
  IF NEW.deliveryaddress IS NULL AND b.deliveryaddress IS NOT NULL THEN
    NEW.deliveryaddress := b.deliveryaddress;
  END IF;
  IF NEW.delivery_city IS NULL AND b.delivery_city IS NOT NULL THEN
    NEW.delivery_city := b.delivery_city;
  END IF;
  IF NEW.delivery_postal_code IS NULL AND b.delivery_postal_code IS NOT NULL THEN
    NEW.delivery_postal_code := b.delivery_postal_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_inherit_booking_coords ON public.projects;
CREATE TRIGGER trg_projects_inherit_booking_coords
BEFORE INSERT OR UPDATE OF booking_id ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.inherit_booking_coords_to_project();


-- 2) Function: när booking-coords uppdateras, propagera till länkade projekt som saknar coords
CREATE OR REPLACE FUNCTION public.propagate_booking_coords_to_projects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.delivery_latitude IS NULL AND NEW.delivery_longitude IS NULL
      AND NEW.deliveryaddress IS NULL) THEN
    RETURN NEW;
  END IF;

  UPDATE public.projects p
     SET delivery_latitude  = COALESCE(p.delivery_latitude,  NEW.delivery_latitude),
         delivery_longitude = COALESCE(p.delivery_longitude, NEW.delivery_longitude),
         deliveryaddress    = COALESCE(p.deliveryaddress,    NEW.deliveryaddress),
         delivery_city      = COALESCE(p.delivery_city,      NEW.delivery_city),
         delivery_postal_code = COALESCE(p.delivery_postal_code, NEW.delivery_postal_code),
         updated_at = now()
   WHERE p.booking_id = NEW.id
     AND (p.delivery_latitude  IS NULL
       OR p.delivery_longitude IS NULL
       OR p.deliveryaddress    IS NULL
       OR p.delivery_city      IS NULL
       OR p.delivery_postal_code IS NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_propagate_coords ON public.bookings;
CREATE TRIGGER trg_bookings_propagate_coords
AFTER INSERT OR UPDATE OF delivery_latitude, delivery_longitude, deliveryaddress, delivery_city, delivery_postal_code
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.propagate_booking_coords_to_projects();


-- 3) Backfill: alla befintliga projekt utan coords får dem från sin bokning
UPDATE public.projects p
   SET delivery_latitude  = COALESCE(p.delivery_latitude,  b.delivery_latitude),
       delivery_longitude = COALESCE(p.delivery_longitude, b.delivery_longitude),
       deliveryaddress    = COALESCE(p.deliveryaddress,    b.deliveryaddress),
       delivery_city      = COALESCE(p.delivery_city,      b.delivery_city),
       delivery_postal_code = COALESCE(p.delivery_postal_code, b.delivery_postal_code),
       updated_at = now()
  FROM public.bookings b
 WHERE p.booking_id = b.id
   AND (p.delivery_latitude  IS NULL
     OR p.delivery_longitude IS NULL
     OR p.deliveryaddress    IS NULL);
