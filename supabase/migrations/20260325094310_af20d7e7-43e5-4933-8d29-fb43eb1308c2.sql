-- Add sync columns to packing_projects to mirror booking data
ALTER TABLE public.packing_projects
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Backfill existing packing_projects from their linked bookings
UPDATE public.packing_projects pp
SET
  client_name = b.client,
  start_date = b.rigdaydate::date,
  end_date = b.rigdowndate::date,
  delivery_address = b.deliveryaddress,
  notes = b.internalnotes
FROM public.bookings b
WHERE pp.booking_id = b.id
  AND pp.booking_id IS NOT NULL;

-- Replace the sync trigger to include new fields + cancellation handling
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

  -- Build packing name from booking data
  IF NEW.eventdate IS NOT NULL THEN
    event_date_str := to_char(NEW.eventdate::date, 'YYYY-MM-DD');
    packing_name := COALESCE(NEW.client, 'Okänd kund') || ' - ' || event_date_str;
  ELSE
    packing_name := COALESCE(NEW.client, 'Okänd kund');
  END IF;

  -- If booking is cancelled, mark packing_project as cancelled (not delete)
  IF upper_status = 'CANCELLED' THEN
    UPDATE public.packing_projects
    SET status = 'cancelled',
        name = packing_name,
        client_name = NEW.client,
        start_date = NEW.rigdaydate::date,
        end_date = NEW.rigdowndate::date,
        delivery_address = NEW.deliveryaddress,
        notes = NEW.internalnotes,
        updated_at = now()
    WHERE booking_id = NEW.id
      AND organization_id = NEW.organization_id;
    RETURN NEW;
  END IF;

  -- Update existing packing project with all synced fields
  UPDATE public.packing_projects
  SET name = packing_name,
      client_name = NEW.client,
      start_date = NEW.rigdaydate::date,
      end_date = NEW.rigdowndate::date,
      delivery_address = NEW.deliveryaddress,
      notes = NEW.internalnotes,
      updated_at = now()
  WHERE booking_id = NEW.id
    AND organization_id = NEW.organization_id;

  -- For confirmed bookings, create packing project if it doesn't exist
  IF upper_status = 'CONFIRMED' THEN
    INSERT INTO public.packing_projects (booking_id, name, status, organization_id, client_name, start_date, end_date, delivery_address, notes)
    SELECT NEW.id, packing_name, 'planning', NEW.organization_id, NEW.client, NEW.rigdaydate::date, NEW.rigdowndate::date, NEW.deliveryaddress, NEW.internalnotes
    WHERE NOT EXISTS (
      SELECT 1 FROM public.packing_projects
      WHERE booking_id = NEW.id AND organization_id = NEW.organization_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger (columns list unchanged)
DROP TRIGGER IF EXISTS trg_sync_packing_on_booking_change ON public.bookings;

CREATE TRIGGER trg_sync_packing_on_booking_change
  AFTER INSERT OR UPDATE OF client, eventdate, rigdaydate, rigdowndate, status,
    deliveryaddress, delivery_city, delivery_postal_code, contact_name, contact_phone, contact_email, internalnotes
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_packing_on_booking_change();