
CREATE OR REPLACE FUNCTION public.auto_create_project_for_orphan_booking(p_booking_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  new_project_id uuid;
  existing_project_id uuid;
  proj_name text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF b.status IS DISTINCT FROM 'CONFIRMED' THEN RETURN NULL; END IF;
  IF COALESCE(b.is_internal, false) THEN RETURN NULL; END IF;
  IF b.large_project_id IS NOT NULL THEN RETURN NULL; END IF;

  -- Existing active project linked → just relink
  SELECT id INTO existing_project_id
  FROM public.projects
  WHERE booking_id = b.id
    AND deleted_at IS NULL
    AND status NOT IN ('completed','cancelled')
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_project_id IS NOT NULL THEN
    UPDATE public.bookings
    SET assigned_to_project = true,
        assigned_project_id = existing_project_id,
        assigned_project_name = COALESCE(assigned_project_name, 'Projekt')
    WHERE id = b.id;
    RETURN existing_project_id;
  END IF;

  -- Legacy small jobs → retire (soft delete) and upgrade to medium project
  UPDATE public.jobs
  SET deleted_at = now(), status = 'cancelled'
  WHERE booking_id = b.id
    AND deleted_at IS NULL
    AND status NOT IN ('completed','cancelled');

  proj_name := CASE
    WHEN b.booking_number IS NOT NULL AND b.client IS NOT NULL THEN b.client || ' #' || b.booking_number
    WHEN b.client IS NOT NULL THEN b.client
    WHEN b.booking_number IS NOT NULL THEN 'Bokning #' || b.booking_number
    ELSE 'Projekt'
  END;

  INSERT INTO public.projects (
    name, booking_id, organization_id, client,
    deliveryaddress, delivery_city, delivery_postal_code,
    delivery_latitude, delivery_longitude,
    eventdate, rigdaydate, rigdowndate,
    contact_name, contact_phone, contact_email,
    internalnotes,
    rig_start_time, rig_end_time,
    event_start_time, event_end_time,
    rigdown_start_time, rigdown_end_time
  ) VALUES (
    proj_name, b.id, b.organization_id, b.client,
    b.deliveryaddress, b.delivery_city, b.delivery_postal_code,
    b.delivery_latitude, b.delivery_longitude,
    b.eventdate, b.rigdaydate, b.rigdowndate,
    b.contact_name, b.contact_phone, b.contact_email,
    b.internalnotes,
    b.rig_start_time, b.rig_end_time,
    b.event_start_time, b.event_end_time,
    b.rigdown_start_time, b.rigdown_end_time
  )
  RETURNING id INTO new_project_id;

  UPDATE public.bookings
  SET assigned_to_project = true,
      assigned_project_id = new_project_id,
      assigned_project_name = 'Projekt: ' || proj_name
  WHERE id = b.id;

  RETURN new_project_id;
END;
$$;

-- Re-run backfill
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.bookings
    WHERE status = 'CONFIRMED'
      AND COALESCE(is_internal, false) = false
      AND large_project_id IS NULL
      AND COALESCE(assigned_to_project, false) = false
  LOOP
    PERFORM public.auto_create_project_for_orphan_booking(r.id);
  END LOOP;
END $$;
