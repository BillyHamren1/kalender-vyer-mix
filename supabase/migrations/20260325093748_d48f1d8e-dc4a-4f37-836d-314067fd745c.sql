-- Trigger function that syncs packing_projects when bookings change
CREATE OR REPLACE FUNCTION public.sync_packing_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  packing_name TEXT;
  event_date_str TEXT;
  upper_status TEXT;
BEGIN
  upper_status := UPPER(COALESCE(NEW.status, ''));

  -- If booking is cancelled, delete packing project
  IF upper_status = 'CANCELLED' THEN
    DELETE FROM public.packing_projects
    WHERE booking_id = NEW.id AND organization_id = NEW.organization_id;
    RETURN NEW;
  END IF;

  -- Build packing name from booking data
  IF NEW.eventdate IS NOT NULL THEN
    event_date_str := to_char(NEW.eventdate::date, 'YYYY-MM-DD');
    packing_name := COALESCE(NEW.client, 'Okänd kund') || ' - ' || event_date_str;
  ELSE
    packing_name := COALESCE(NEW.client, 'Okänd kund');
  END IF;

  -- Update existing packing project name
  UPDATE public.packing_projects
  SET name = packing_name,
      updated_at = now()
  WHERE booking_id = NEW.id
    AND organization_id = NEW.organization_id
    AND name IS DISTINCT FROM packing_name;

  -- For confirmed bookings, create packing project if it doesn't exist
  IF upper_status = 'CONFIRMED' THEN
    INSERT INTO public.packing_projects (booking_id, name, status, organization_id)
    SELECT NEW.id, packing_name, 'planning', NEW.organization_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.packing_projects
      WHERE booking_id = NEW.id AND organization_id = NEW.organization_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_packing_on_booking_change ON public.bookings;

-- Create trigger on INSERT and UPDATE
CREATE TRIGGER trg_sync_packing_on_booking_change
  AFTER INSERT OR UPDATE OF client, eventdate, rigdaydate, rigdowndate, status,
    deliveryaddress, delivery_city, delivery_postal_code, contact_name, contact_phone, contact_email, internalnotes
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_packing_on_booking_change();