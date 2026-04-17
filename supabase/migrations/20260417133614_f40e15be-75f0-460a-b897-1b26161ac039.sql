ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_type text;

ALTER TABLE public.time_reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_entry_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS time_reports_source_entry_uniq
  ON public.time_reports(source_entry_id)
  WHERE source_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_internal_lager_booking(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
BEGIN
  SELECT id INTO _booking_id
  FROM public.bookings
  WHERE organization_id = _org_id
    AND is_internal = true
    AND internal_type = 'warehouse'
  LIMIT 1;

  IF _booking_id IS NOT NULL THEN
    RETURN _booking_id;
  END IF;

  _booking_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, organization_id, client, status, is_internal, internal_type,
    booking_number, eventdate
  ) VALUES (
    _booking_id, _org_id, 'Lager', 'CONFIRMED', true, 'warehouse',
    'LAGER', CURRENT_DATE
  );

  RETURN _booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_location_entry_to_time_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _hours numeric;
  _start_time time;
  _end_time time;
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

  _booking_id := public.ensure_internal_lager_booking(NEW.organization_id);
  _start_time := (NEW.entered_at AT TIME ZONE 'Europe/Stockholm')::time;
  _end_time := (NEW.exited_at AT TIME ZONE 'Europe/Stockholm')::time;

  INSERT INTO public.time_reports (
    staff_id, booking_id, report_date, start_time, end_time,
    hours_worked, overtime_hours, description, approved,
    source, source_entry_id, organization_id
  ) VALUES (
    NEW.staff_id, _booking_id, NEW.entry_date, _start_time, _end_time,
    _hours, 0, 'Auto: lagervistelse (' || NEW.source || ')', false,
    'location_auto', NEW.id, NEW.organization_id
  )
  ON CONFLICT (source_entry_id) DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    hours_worked = EXCLUDED.hours_worked,
    report_date = EXCLUDED.report_date;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_location_entry_to_time_report_trigger ON public.location_time_entries;
CREATE TRIGGER sync_location_entry_to_time_report_trigger
AFTER INSERT OR UPDATE ON public.location_time_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_entry_to_time_report();

CREATE OR REPLACE FUNCTION public.auto_close_open_location_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _closed_count integer;
BEGIN
  WITH closed AS (
    UPDATE public.location_time_entries
    SET exited_at = LEAST(
      now(),
      ((entry_date + interval '1 day') AT TIME ZONE 'Europe/Stockholm') - interval '1 minute'
    )
    WHERE exited_at IS NULL
      AND entry_date <= CURRENT_DATE
    RETURNING 1
  )
  SELECT COUNT(*) INTO _closed_count FROM closed;

  RETURN _closed_count;
END;
$function$;