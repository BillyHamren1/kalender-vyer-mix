-- 1. Restore the trigger on location_time_entries
DROP TRIGGER IF EXISTS trg_sync_location_entry_to_time_report ON public.location_time_entries;

CREATE TRIGGER trg_sync_location_entry_to_time_report
AFTER INSERT OR UPDATE ON public.location_time_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_entry_to_time_report();

-- 2. Backfill all closed location entries that don't yet have a time_report
DO $$
DECLARE
  _entry RECORD;
  _booking_id uuid;
  _hours numeric;
  _start_time time;
  _end_time time;
BEGIN
  FOR _entry IN
    SELECT lte.*
    FROM public.location_time_entries lte
    LEFT JOIN public.time_reports tr ON tr.source_entry_id = lte.id
    WHERE lte.exited_at IS NOT NULL
      AND tr.id IS NULL
  LOOP
    _hours := ROUND(EXTRACT(EPOCH FROM (_entry.exited_at - _entry.entered_at)) / 3600.0, 2);
    IF _hours <= 0 THEN
      CONTINUE;
    END IF;

    _booking_id := public.ensure_internal_lager_booking(_entry.organization_id);
    _start_time := (_entry.entered_at AT TIME ZONE 'Europe/Stockholm')::time;
    _end_time := (_entry.exited_at AT TIME ZONE 'Europe/Stockholm')::time;

    INSERT INTO public.time_reports (
      staff_id, booking_id, report_date, start_time, end_time,
      hours_worked, overtime_hours, description, approved,
      source, source_entry_id, organization_id
    ) VALUES (
      _entry.staff_id, _booking_id, _entry.entry_date, _start_time, _end_time,
      _hours, 0, 'Auto: lagervistelse (' || _entry.source || ')', false,
      'location_auto', _entry.id, _entry.organization_id
    )
    ON CONFLICT (source_entry_id) DO NOTHING;
  END LOOP;
END $$;