-- 1. Replace the trigger function to respect booking_id / large_project_id on the LTE row
-- Note: time_reports.booking_id is TEXT, while location_time_entries.booking_id is UUID -> cast.
CREATE OR REPLACE FUNCTION public.sync_location_entry_to_time_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id text;
  _large_project_id uuid;
  _hours numeric;
  _start_time time;
  _end_time time;
  _description text;
BEGIN
  IF NEW.exited_at IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.exited_at IS NOT NULL THEN
      DELETE FROM public.time_reports WHERE source_entry_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  _hours := ROUND(EXTRACT(EPOCH FROM (NEW.exited_at - NEW.entered_at)) / 3600.0, 2);

  IF _hours <= 0 THEN
    DELETE FROM public.time_reports WHERE source_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Priority: booking_id > large_project_id > location-only (Lager fallback)
  IF NEW.booking_id IS NOT NULL THEN
    _booking_id := NEW.booking_id::text;
    _large_project_id := NULL;
    _description := 'Auto: bokning (' || NEW.source || ')';
  ELSIF NEW.large_project_id IS NOT NULL THEN
    _booking_id := NULL;
    _large_project_id := NEW.large_project_id;
    _description := 'Auto: projekt (' || NEW.source || ')';
  ELSE
    _booking_id := public.ensure_internal_lager_booking(NEW.organization_id);
    _large_project_id := NULL;
    _description := 'Auto: lagervistelse (' || NEW.source || ')';
  END IF;

  _start_time := (NEW.entered_at AT TIME ZONE 'Europe/Stockholm')::time;
  _end_time := (NEW.exited_at AT TIME ZONE 'Europe/Stockholm')::time;

  INSERT INTO public.time_reports (
    staff_id, booking_id, large_project_id, report_date, start_time, end_time,
    hours_worked, overtime_hours, description, approved,
    source, source_entry_id, organization_id
  ) VALUES (
    NEW.staff_id, _booking_id, _large_project_id, NEW.entry_date, _start_time, _end_time,
    _hours, 0, _description, false,
    'location_auto', NEW.id, NEW.organization_id
  )
  ON CONFLICT (source_entry_id) DO UPDATE SET
    booking_id = EXCLUDED.booking_id,
    large_project_id = EXCLUDED.large_project_id,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    hours_worked = EXCLUDED.hours_worked,
    report_date = EXCLUDED.report_date,
    description = EXCLUDED.description;

  RETURN NEW;
END;
$function$;

-- 2. Backfill: fix unapproved auto-rows that landed on Lager but the LTE points at a booking
UPDATE public.time_reports tr
SET booking_id = lte.booking_id::text,
    large_project_id = NULL,
    description = 'Auto: bokning (' || lte.source || ') [korrigerad]'
FROM public.location_time_entries lte
WHERE tr.source_entry_id = lte.id
  AND tr.source = 'location_auto'
  AND tr.approved = false
  AND lte.booking_id IS NOT NULL
  AND tr.booking_id IS DISTINCT FROM lte.booking_id::text;

-- 3. Backfill: fix unapproved auto-rows that should point to a large project
UPDATE public.time_reports tr
SET booking_id = NULL,
    large_project_id = lte.large_project_id,
    description = 'Auto: projekt (' || lte.source || ') [korrigerad]'
FROM public.location_time_entries lte
WHERE tr.source_entry_id = lte.id
  AND tr.source = 'location_auto'
  AND tr.approved = false
  AND lte.booking_id IS NULL
  AND lte.large_project_id IS NOT NULL
  AND tr.large_project_id IS DISTINCT FROM lte.large_project_id;