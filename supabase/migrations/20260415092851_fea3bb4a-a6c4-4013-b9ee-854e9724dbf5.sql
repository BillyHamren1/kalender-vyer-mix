
-- Add review columns to packing_projects
ALTER TABLE public.packing_projects
  ADD COLUMN IF NOT EXISTS needs_packing_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_packing_review_reason text;

-- Update trigger to flag packing reviews on ALL booking changes
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
  has_changes BOOLEAN := false;
BEGIN
  upper_status := UPPER(COALESCE(NEW.status, ''));

  -- Build packing name from booking data
  IF NEW.eventdate IS NOT NULL THEN
    event_date_str := to_char(NEW.eventdate::date, 'YYYY-MM-DD');
    packing_name := COALESCE(NEW.client, 'Okänd kund') || ' - ' || event_date_str;
  ELSE
    packing_name := COALESCE(NEW.client, 'Okänd kund');
  END IF;

  -- Detect if any packing-relevant fields changed
  IF TG_OP = 'UPDATE' THEN
    has_changes := (
      OLD.client IS DISTINCT FROM NEW.client OR
      OLD.rigdaydate IS DISTINCT FROM NEW.rigdaydate OR
      OLD.eventdate IS DISTINCT FROM NEW.eventdate OR
      OLD.rigdowndate IS DISTINCT FROM NEW.rigdowndate OR
      OLD.deliveryaddress IS DISTINCT FROM NEW.deliveryaddress OR
      OLD.internalnotes IS DISTINCT FROM NEW.internalnotes OR
      OLD.status IS DISTINCT FROM NEW.status OR
      OLD.rig_start_time IS DISTINCT FROM NEW.rig_start_time OR
      OLD.rig_end_time IS DISTINCT FROM NEW.rig_end_time OR
      OLD.event_start_time IS DISTINCT FROM NEW.event_start_time OR
      OLD.event_end_time IS DISTINCT FROM NEW.event_end_time OR
      OLD.rigdown_start_time IS DISTINCT FROM NEW.rigdown_start_time OR
      OLD.rigdown_end_time IS DISTINCT FROM NEW.rigdown_end_time OR
      OLD.carry_more_than_10m IS DISTINCT FROM NEW.carry_more_than_10m OR
      OLD.ground_nails_allowed IS DISTINCT FROM NEW.ground_nails_allowed OR
      OLD.exact_time_needed IS DISTINCT FROM NEW.exact_time_needed OR
      OLD.exact_time_info IS DISTINCT FROM NEW.exact_time_info
    );
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
        updated_at = now(),
        needs_packing_review = CASE WHEN has_changes THEN true ELSE needs_packing_review END,
        needs_packing_review_reason = CASE WHEN has_changes THEN 'booking_updated' ELSE needs_packing_review_reason END
    WHERE booking_id = NEW.id
      AND organization_id = NEW.organization_id
      AND large_project_id IS NOT NULL;

    RETURN NEW;
  END IF;

  -- Non-consolidated: original behavior + review flag
  IF upper_status = 'CANCELLED' THEN
    UPDATE public.packing_projects
    SET status = 'cancelled',
        name = packing_name,
        client_name = NEW.client,
        start_date = NEW.rigdaydate::date,
        end_date = NEW.rigdowndate::date,
        delivery_address = NEW.deliveryaddress,
        notes = NEW.internalnotes,
        updated_at = now(),
        needs_packing_review = true,
        needs_packing_review_reason = 'cancelled'
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
      updated_at = now(),
      needs_packing_review = CASE WHEN has_changes THEN true ELSE needs_packing_review END,
      needs_packing_review_reason = CASE WHEN has_changes THEN 'booking_updated' ELSE needs_packing_review_reason END
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
