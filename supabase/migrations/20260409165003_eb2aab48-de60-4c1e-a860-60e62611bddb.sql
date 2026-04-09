
DO $$
DECLARE
  proj RECORD;
  new_packing_id uuid;
  first_booking RECORD;
BEGIN
  FOR proj IN
    SELECT 
      lp.id as large_project_id,
      lp.name as project_name,
      lp.organization_id,
      array_agg(DISTINCT lpb.booking_id) as booking_ids,
      array_agg(DISTINCT pp.id) FILTER (WHERE pp.id IS NOT NULL) as packing_ids
    FROM large_projects lp
    JOIN large_project_bookings lpb ON lpb.large_project_id = lp.id
    LEFT JOIN packing_projects pp ON pp.booking_id = lpb.booking_id 
      AND pp.organization_id = lp.organization_id
      AND pp.large_project_id IS NULL
    WHERE lp.deleted_at IS NULL
    GROUP BY lp.id, lp.name, lp.organization_id
    HAVING COUNT(DISTINCT pp.id) > 1
  LOOP
    SELECT b.id, b.client, b.deliveryaddress
    INTO first_booking
    FROM bookings b
    WHERE b.id = proj.booking_ids[1];

    INSERT INTO packing_projects (name, booking_id, large_project_id, client_name, delivery_address, status, organization_id)
    VALUES (
      proj.project_name,
      proj.booking_ids[1],
      proj.large_project_id,
      first_booking.client,
      first_booking.deliveryaddress,
      'planning',
      proj.organization_id
    )
    RETURNING id INTO new_packing_id;

    INSERT INTO packing_project_bookings (packing_id, booking_id, organization_id)
    SELECT new_packing_id, unnest(proj.booking_ids), proj.organization_id;

    UPDATE packing_list_items SET packing_id = new_packing_id WHERE packing_id = ANY(proj.packing_ids);
    UPDATE packing_tasks SET packing_id = new_packing_id WHERE packing_id = ANY(proj.packing_ids);
    UPDATE packing_comments SET packing_id = new_packing_id WHERE packing_id = ANY(proj.packing_ids);
    UPDATE packing_files SET packing_id = new_packing_id WHERE packing_id = ANY(proj.packing_ids);

    DELETE FROM packing_projects WHERE id = ANY(proj.packing_ids);
  END LOOP;
END;
$$;
