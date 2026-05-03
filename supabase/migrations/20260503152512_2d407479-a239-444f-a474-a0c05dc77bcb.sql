-- 1) Allow ping_backfill rows to bypass overlap protection (same as location_auto)
CREATE OR REPLACE FUNCTION public.tr_prevent_time_report_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_range tstzrange;
  _conflict_id uuid;
BEGIN
  IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.source IN ('location_auto', 'ping_backfill') THEN
    RETURN NEW;
  END IF;

  _new_range := public.tr_shift_interval(NEW.report_date, NEW.start_time, NEW.end_time);
  IF _new_range IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _conflict_id
  FROM public.time_reports tr
  WHERE tr.staff_id = NEW.staff_id
    AND tr.id IS DISTINCT FROM NEW.id
    AND tr.start_time IS NOT NULL
    AND tr.end_time   IS NOT NULL
    AND tr.source NOT IN ('location_auto', 'ping_backfill')
    AND tr.report_date BETWEEN (NEW.report_date - 1) AND (NEW.report_date + 1)
    AND public.tr_shift_interval(tr.report_date, tr.start_time, tr.end_time) && _new_range
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Time report overlaps existing report % for this staff member (night shifts included)', _conflict_id
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Insert backfill rows
WITH pings AS (
  SELECT h.staff_id, h.recorded_at, h.lat, h.lng, b.id AS booking_id, b.organization_id,
    (6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(b.delivery_latitude))*cos(radians(h.lat))*cos(radians(h.lng)-radians(b.delivery_longitude))
      + sin(radians(b.delivery_latitude))*sin(radians(h.lat))
    )))) AS dist_m
  FROM staff_location_history h
  JOIN booking_staff_assignments bsa
    ON bsa.staff_id = h.staff_id
   AND bsa.assignment_date = (h.recorded_at AT TIME ZONE 'Europe/Stockholm')::date
  JOIN bookings b ON b.id = bsa.booking_id
  WHERE h.recorded_at >= now() - interval '7 days'
    AND b.delivery_latitude IS NOT NULL AND b.delivery_longitude IS NOT NULL
),
in_radius AS (SELECT * FROM pings WHERE dist_m <= 300),
gapped AS (
  SELECT *,
    CASE WHEN EXTRACT(EPOCH FROM (recorded_at - LAG(recorded_at) OVER w)) > 1800
         OR LAG(recorded_at) OVER w IS NULL THEN 1 ELSE 0 END AS new_seg
  FROM in_radius
  WINDOW w AS (PARTITION BY staff_id, booking_id ORDER BY recorded_at)
),
segs AS (
  SELECT staff_id, booking_id, organization_id,
    SUM(new_seg) OVER (PARTITION BY staff_id, booking_id ORDER BY recorded_at) AS seg_id,
    recorded_at
  FROM gapped
),
agg AS (
  SELECT staff_id, booking_id, organization_id, seg_id,
    MIN(recorded_at) AS seg_start, MAX(recorded_at) AS seg_end
  FROM segs
  GROUP BY staff_id, booking_id, organization_id, seg_id
)
INSERT INTO public.time_reports (
  staff_id, booking_id, organization_id, report_date,
  start_time, end_time, hours_worked, source, approved, description
)
SELECT
  staff_id, booking_id, organization_id,
  (seg_start AT TIME ZONE 'Europe/Stockholm')::date,
  (seg_start AT TIME ZONE 'Europe/Stockholm')::time(0),
  (seg_end   AT TIME ZONE 'Europe/Stockholm')::time(0),
  ROUND(EXTRACT(EPOCH FROM (seg_end - seg_start))/3600.0, 2),
  'ping_backfill',
  false,
  'Auto-genererad från GPS-pings (backfill).'
FROM agg
WHERE EXTRACT(EPOCH FROM (seg_end - seg_start))/60.0 >= 10;