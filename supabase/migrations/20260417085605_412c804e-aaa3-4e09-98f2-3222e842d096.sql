DO $mig$
DECLARE
  rec RECORD;
  new_wp_id uuid;
  src_proj_id uuid;
  src_lp_id uuid;
  src_proj_num text;
  resolved_num text;
  exists_num boolean;
  wp_status text;
  pack_start date;
  pack_end date;
  return_start date;
  return_end date;
  ev_date date;
  rd_date date;
BEGIN
  FOR rec IN
    SELECT p.id AS pp_id,
           p.organization_id AS org_id,
           p.name AS pp_name,
           p.client_name AS pp_client_name,
           p.booking_id AS pp_booking_id,
           p.large_project_id AS pp_lp_id,
           p.status AS pp_status,
           p.start_date AS pp_start,
           p.end_date AS pp_end,
           b.eventdate AS b_eventdate,
           b.rigdowndate AS b_rigdowndate
    FROM public.packing_projects p
    LEFT JOIN public.bookings b ON b.id::text = p.booking_id
    WHERE p.warehouse_project_id IS NULL
  LOOP
    src_proj_id := NULL; src_lp_id := NULL; src_proj_num := NULL; resolved_num := NULL;

    IF rec.pp_lp_id IS NOT NULL THEN
      src_lp_id := rec.pp_lp_id;
      SELECT project_number INTO src_proj_num FROM public.large_projects WHERE id = rec.pp_lp_id;
    ELSIF rec.pp_booking_id IS NOT NULL THEN
      SELECT id INTO src_proj_id FROM public.projects WHERE booking_id = rec.pp_booking_id LIMIT 1;
      SELECT booking_number INTO src_proj_num FROM public.bookings WHERE id::text = rec.pp_booking_id;
    END IF;

    -- Pre-compute a unique project_number to avoid collisions with the trigger
    IF src_proj_num IS NOT NULL AND src_proj_num <> '' THEN
      resolved_num := 'Lager-' || src_proj_num;
      SELECT EXISTS(SELECT 1 FROM public.warehouse_projects WHERE organization_id = rec.org_id AND project_number = resolved_num)
        INTO exists_num;
      IF exists_num THEN
        -- Append suffix to make unique
        FOR i IN 2..50 LOOP
          resolved_num := 'Lager-' || src_proj_num || '-' || i::text;
          SELECT EXISTS(SELECT 1 FROM public.warehouse_projects WHERE organization_id = rec.org_id AND project_number = resolved_num)
            INTO exists_num;
          EXIT WHEN NOT exists_num;
        END LOOP;
      END IF;
    END IF;

    wp_status := CASE rec.pp_status
      WHEN 'planning' THEN 'planning'
      WHEN 'in_progress' THEN 'in_progress'
      WHEN 'packed' THEN 'completed'
      WHEN 'delivered' THEN 'completed'
      WHEN 'completed' THEN 'completed'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'planning'
    END;

    ev_date := COALESCE(rec.b_eventdate::date, rec.pp_start);
    rd_date := COALESCE(rec.b_rigdowndate::date, rec.pp_end, ev_date);

    pack_start := COALESCE(ev_date - 3, CURRENT_DATE);
    pack_end := COALESCE(ev_date - 1, CURRENT_DATE);
    return_start := COALESCE(rd_date + 1, CURRENT_DATE);
    return_end := COALESCE(rd_date + 2, CURRENT_DATE);

    INSERT INTO public.warehouse_projects (
      organization_id, project_number, name,
      source_project_id, source_large_project_id, source_project_number,
      status, start_date, end_date
    ) VALUES (
      rec.org_id,
      COALESCE(resolved_num, ''),
      COALESCE(rec.pp_name, rec.pp_client_name, 'Lagerprojekt'),
      src_proj_id, src_lp_id, src_proj_num,
      wp_status, rec.pp_start, rec.pp_end
    ) RETURNING id INTO new_wp_id;

    INSERT INTO public.warehouse_project_tasks (
      warehouse_project_id, organization_id, title, start_date, end_date, status, sort_order
    ) VALUES
      (new_wp_id, rec.org_id, 'Packning', pack_start, pack_end, wp_status, 0),
      (new_wp_id, rec.org_id, 'Retur', return_start, return_end, wp_status, 1);

    UPDATE public.packing_projects SET warehouse_project_id = new_wp_id WHERE id = rec.pp_id;

    UPDATE public.warehouse_project_inbox
    SET status = 'converted', warehouse_project_id = new_wp_id, processed_at = now()
    WHERE warehouse_project_id IS NULL
      AND status = 'new'
      AND ((source_type = 'project' AND source_id = src_proj_id)
        OR (source_type = 'large_project' AND source_id = src_lp_id));
  END LOOP;
END $mig$;

UPDATE public.warehouse_project_tasks SET title = 'Packning' WHERE title = 'Packa';
UPDATE public.warehouse_project_tasks SET title = 'Retur' WHERE title IN ('Returnera', 'Uppackning', 'Upppackning');

DELETE FROM public.warehouse_calendar_events
WHERE event_type IN ('delivery', 'event', 'inventory', 'unpacking');