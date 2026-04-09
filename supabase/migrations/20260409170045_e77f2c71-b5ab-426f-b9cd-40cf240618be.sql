UPDATE packing_projects pp
SET start_date = sub.min_rig,
    end_date = sub.max_rigdown
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
  AND pp.large_project_id IS NOT NULL
  AND pp.start_date IS NULL;