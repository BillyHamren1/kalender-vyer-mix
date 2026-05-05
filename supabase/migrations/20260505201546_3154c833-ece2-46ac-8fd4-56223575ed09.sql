CREATE OR REPLACE FUNCTION public.ensure_workday_for_time_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_existing_id uuid;
  v_has_open boolean;
BEGIN
  IF TG_TABLE_NAME = 'time_reports' THEN
    v_staff_id := NEW.staff_id;
    v_org_id := NEW.organization_id;
    v_started_at := (NEW.report_date + COALESCE(NEW.start_time, '00:00'::time)) AT TIME ZONE 'UTC';
    IF NEW.end_time IS NOT NULL THEN
      v_ended_at := (NEW.report_date + NEW.end_time) AT TIME ZONE 'UTC';
    END IF;
  ELSIF TG_TABLE_NAME = 'location_time_entries' THEN
    v_staff_id := NEW.staff_id;
    v_org_id := NEW.organization_id;
    v_started_at := NEW.entered_at;
    v_ended_at := NEW.exited_at;
  ELSE
    RETURN NEW;
  END IF;

  IF v_staff_id IS NULL OR v_org_id IS NULL OR v_started_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_date := (v_started_at AT TIME ZONE 'UTC')::date;
  v_day_start := (v_date::text || 'T00:00:00.000Z')::timestamptz;
  v_day_end   := (v_date::text || 'T23:59:59.999Z')::timestamptz;

  SELECT id INTO v_existing_id
  FROM public.workdays
  WHERE staff_id = v_staff_id
    AND organization_id = v_org_id
    AND started_at >= v_day_start
    AND started_at <= v_day_end
  ORDER BY started_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.workdays
    SET started_at = LEAST(started_at, v_started_at),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'auto_repair_touched', true,
          'auto_repair_last_source', TG_TABLE_NAME
        )
    WHERE id = v_existing_id
      AND started_at > v_started_at;
    RETURN NEW;
  END IF;

  -- Skydda mot one-open-per-staff: om personen redan har en öppen workday
  -- (annan dag) sätter vi ended_at om vi har det, annars hoppar vi över
  -- auto-create för att inte krocka med constraintet.
  SELECT EXISTS (
    SELECT 1 FROM public.workdays
    WHERE staff_id = v_staff_id AND ended_at IS NULL
  ) INTO v_has_open;

  IF v_has_open AND v_ended_at IS NULL THEN
    -- Sätt ended_at = v_started_at + 1 minut som platshållare så vi inte
    -- bryter constraintet. Markeras "needs_review".
    v_ended_at := v_started_at + interval '1 minute';
  END IF;

  INSERT INTO public.workdays (
    staff_id, organization_id, started_at, ended_at, started_by, notes, metadata, review_status
  ) VALUES (
    v_staff_id, v_org_id, v_started_at, v_ended_at,
    'auto_repair_from_timer',
    'Auto-repair: workday skapad från ' || TG_TABLE_NAME,
    jsonb_build_object(
      'auto_started', true,
      'auto_start_source', 'auto_repair_from_timer',
      'confidence', 'high',
      'reason_codes', jsonb_build_array('timer_or_time_report_exists'),
      'origin_table', TG_TABLE_NAME,
      'origin_id', NEW.id
    ),
    'needs_review'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ensure_workday_for_time_entry failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_workday_time_reports ON public.time_reports;
CREATE TRIGGER trg_ensure_workday_time_reports
AFTER INSERT ON public.time_reports
FOR EACH ROW
WHEN (NEW.is_subdivision IS NOT TRUE)
EXECUTE FUNCTION public.ensure_workday_for_time_entry();

DROP TRIGGER IF EXISTS trg_ensure_workday_location_time_entries ON public.location_time_entries;
CREATE TRIGGER trg_ensure_workday_location_time_entries
AFTER INSERT ON public.location_time_entries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_workday_for_time_entry();

-- Backfill: befintliga dagar utan workday, stäng på sista timer-slut.
WITH tr_starts AS (
  SELECT
    tr.staff_id,
    tr.organization_id,
    tr.report_date AS d,
    MIN((tr.report_date + COALESCE(tr.start_time, '00:00'::time)) AT TIME ZONE 'UTC') AS first_start,
    MAX((tr.report_date + COALESCE(tr.end_time, tr.start_time, '00:00'::time)) AT TIME ZONE 'UTC') AS last_end
  FROM public.time_reports tr
  WHERE tr.is_subdivision IS NOT TRUE
    AND tr.staff_id IS NOT NULL
    AND tr.organization_id IS NOT NULL
  GROUP BY tr.staff_id, tr.organization_id, tr.report_date
),
lte_starts AS (
  SELECT
    lte.staff_id,
    lte.organization_id,
    (lte.entered_at AT TIME ZONE 'UTC')::date AS d,
    MIN(lte.entered_at) AS first_start,
    MAX(COALESCE(lte.exited_at, lte.entered_at)) AS last_end
  FROM public.location_time_entries lte
  WHERE lte.staff_id IS NOT NULL
    AND lte.organization_id IS NOT NULL
  GROUP BY lte.staff_id, lte.organization_id, (lte.entered_at AT TIME ZONE 'UTC')::date
),
combined AS (
  SELECT * FROM tr_starts UNION ALL SELECT * FROM lte_starts
),
collapsed AS (
  SELECT staff_id, organization_id, d,
         MIN(first_start) AS first_start,
         MAX(last_end) AS last_end
  FROM combined
  GROUP BY staff_id, organization_id, d
)
INSERT INTO public.workdays (
  staff_id, organization_id, started_at, ended_at, started_by, notes, metadata, review_status
)
SELECT
  c.staff_id, c.organization_id, c.first_start,
  GREATEST(c.last_end, c.first_start + interval '1 minute'),
  'auto_repair_from_timer',
  'Auto-repair backfill: workday skapad från befintlig timer/tidrapport',
  jsonb_build_object(
    'auto_started', true,
    'auto_start_source', 'auto_repair_from_timer',
    'confidence', 'high',
    'reason_codes', jsonb_build_array('timer_or_time_report_exists'),
    'backfilled', true
  ),
  'needs_review'
FROM collapsed c
WHERE NOT EXISTS (
  SELECT 1 FROM public.workdays w
  WHERE w.staff_id = c.staff_id
    AND w.organization_id = c.organization_id
    AND w.started_at >= (c.d::text || 'T00:00:00.000Z')::timestamptz
    AND w.started_at <= (c.d::text || 'T23:59:59.999Z')::timestamptz
);
