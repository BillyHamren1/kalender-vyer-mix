
-- 1. Update trigger: use large_projects dates directly for consolidated packing projects
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
  lp_start DATE;
  lp_end DATE;
  lp_id UUID;
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
  SELECT pp.large_project_id INTO lp_id
  FROM public.packing_projects pp
  WHERE pp.booking_id = NEW.id
    AND pp.organization_id = NEW.organization_id
    AND pp.large_project_id IS NOT NULL
  LIMIT 1;

  is_consolidated := (lp_id IS NOT NULL);

  -- If consolidated: use the large project's own dates, don't overwrite name
  IF is_consolidated THEN
    SELECT
      (SELECT min(d::date) FROM unnest(lp.start_date) AS d WHERE d IS NOT NULL),
      (SELECT max(d::date) FROM unnest(lp.end_date) AS d WHERE d IS NOT NULL)
    INTO lp_start, lp_end
    FROM public.large_projects lp
    WHERE lp.id = lp_id;

    UPDATE public.packing_projects
    SET start_date = lp_start,
        end_date = COALESCE(lp_end, lp_start),
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

-- 2. Re-populate dates from large_projects directly
UPDATE packing_projects pp
SET start_date = sub.lp_start,
    end_date = sub.lp_end,
    updated_at = now()
FROM (
  SELECT lp.id as lp_id,
         (SELECT min(d::date) FROM unnest(lp.start_date) AS d WHERE d IS NOT NULL) as lp_start,
         (SELECT max(d::date) FROM unnest(lp.end_date) AS d WHERE d IS NOT NULL) as lp_end
  FROM large_projects lp
) sub
WHERE pp.large_project_id = sub.lp_id
  AND sub.lp_start IS NOT NULL;
