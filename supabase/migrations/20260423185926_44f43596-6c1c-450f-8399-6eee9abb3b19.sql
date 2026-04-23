WITH ranked_open AS (
  SELECT
    id,
    staff_id,
    organization_id,
    start_time,
    report_date,
    lead(start_time) OVER (
      PARTITION BY organization_id, staff_id
      ORDER BY start_time ASC, id ASC
    ) AS next_open_start,
    row_number() OVER (
      PARTITION BY organization_id, staff_id
      ORDER BY start_time DESC, id DESC
    ) AS rn_desc
  FROM public.travel_time_logs
  WHERE end_time IS NULL
), to_close AS (
  SELECT
    id,
    LEAST(
      COALESCE(next_open_start, now()),
      start_time + interval '2 hours',
      ((report_date::timestamp + interval '1 day') - interval '1 second')
    ) AS synthetic_end
  FROM ranked_open
  WHERE rn_desc > 1
)
UPDATE public.travel_time_logs ttl
SET end_time = tc.synthetic_end,
    hours_worked = ROUND((EXTRACT(EPOCH FROM (tc.synthetic_end - ttl.start_time)) / 3600.0)::numeric, 2),
    to_address = COALESCE(ttl.to_address, ttl.from_address),
    to_latitude = COALESCE(ttl.to_latitude, ttl.from_latitude),
    to_longitude = COALESCE(ttl.to_longitude, ttl.from_longitude),
    updated_at = now()
FROM to_close tc
WHERE ttl.id = tc.id
  AND ttl.end_time IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_single_open_travel_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.travel_time_logs t
      WHERE t.organization_id = NEW.organization_id
        AND t.staff_id = NEW.staff_id
        AND t.end_time IS NULL
        AND t.id <> COALESCE(NEW.id, gen_random_uuid())
    ) THEN
      RAISE EXCEPTION 'single_open_travel_log_violation'
        USING ERRCODE = '23505',
              DETAIL = 'A staff member cannot have more than one open travel_time_log.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_open_travel_log ON public.travel_time_logs;

CREATE TRIGGER trg_enforce_single_open_travel_log
BEFORE INSERT OR UPDATE OF staff_id, organization_id, end_time
ON public.travel_time_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_open_travel_log();

CREATE UNIQUE INDEX IF NOT EXISTS travel_time_logs_one_open_per_staff_idx
ON public.travel_time_logs (organization_id, staff_id)
WHERE end_time IS NULL;