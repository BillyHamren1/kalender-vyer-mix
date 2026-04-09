
-- 1. Update trigger to protect consolidated packing projects (large_project_id IS NOT NULL)
CREATE OR REPLACE FUNCTION public.sync_packing_on_booking_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  packing_name TEXT;
  event_date_str TEXT;
  upper_status TEXT;
  is_consolidated BOOLEAN;
  consolidated_start DATE;
  consolidated_end DATE;
BEGIN
  upper_status := UPPER(COALESCE(NEW.status, ''));

  -- Build packing name from booking data
  IF NEW.eventdate IS NOT NULL THEN
    event_date_str := to_char(NEW.eventdate::date, 'YYYY-MM-DD');
    packing_name := COALESCE(NEW.client, 'Okänd kund') || ' - ' || event_date_str;
  ELSE
    packing_name := COALESCE(NEW.client, 'Okänd kund');
  END IF;

  -- Check if this booking belongs to a consolidated packing project
  SELECT EXISTS (
    SELECT 1 FROM public.packing_projects pp
    WHERE pp.booking_id = NEW.id
      AND pp.organization_id = NEW.organization_id
      AND pp.large_project_id IS NOT NULL
  ) INTO is_consolidated;

  -- If consolidated: recalculate date range from ALL linked bookings, don't overwrite name
  IF is_consolidated THEN
    SELECT min(b.rigdaydate::date), max(b.rigdowndate::date)
    INTO consolidated_start, consolidated_end
    FROM public.packing_project_bookings ppb
    JOIN public.bookings b ON b.id = ppb.booking_id
    JOIN public.packing_projects pp ON pp.id = ppb.packing_id
    WHERE pp.booking_id = NEW.id
      AND pp.organization_id = NEW.organization_id
      AND b.rigdaydate IS NOT NULL;

    UPDATE public.packing_projects
    SET start_date = consolidated_start,
        end_date = COALESCE(consolidated_end, consolidated_start),
        updated_at = now()
    WHERE booking_id = NEW.id
      AND organization_id = NEW.organization_id
      AND large_project_id IS NOT NULL;

    RETURN NEW;
  END IF;

  -- Non-consolidated: original behavior
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
$function$;

-- 2. Re-populate dates for all consolidated packing projects
UPDATE packing_projects pp
SET start_date = sub.min_rig,
    end_date = sub.max_rigdown,
    updated_at = now()
FROM (
  SELECT ppb.packing_id,
         min(b.rigdaydate::date) as min_rig,
         max(b.rigdowndate::date) as max_rigdown
  FROM packing_project_bookings ppb
  JOIN bookings b ON b.id = ppb.booking_id
  WHERE b.rigdaydate IS NOT NULL
  GROUP BY ppb.packing_id
) sub
WHERE pp.id = sub.packing_id
  AND pp.large_project_id IS NOT NULL;
