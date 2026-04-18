-- ============================================================
-- Time report safety: approved-lock + datetime overlap protection
-- Source-of-truth enforcement at the DB layer (covers any write path).
-- ============================================================

-- Helper: build a UTC interval [start, end) from report_date + start_time + end_time.
-- Night shifts (end <= start) extend by 1 day.
CREATE OR REPLACE FUNCTION public.tr_shift_interval(
  _date date,
  _start time,
  _end time
) RETURNS tstzrange
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _start_ts timestamptz;
  _end_ts   timestamptz;
BEGIN
  IF _date IS NULL OR _start IS NULL OR _end IS NULL THEN
    RETURN NULL;
  END IF;
  _start_ts := (_date::timestamp + _start) AT TIME ZONE 'UTC';
  _end_ts   := (_date::timestamp + _end)   AT TIME ZONE 'UTC';
  IF _end_ts <= _start_ts THEN
    _end_ts := _end_ts + interval '1 day';
  END IF;
  RETURN tstzrange(_start_ts, _end_ts, '[)');
END;
$$;

-- 1. APPROVED LOCK
-- Once approved=true, no business fields may change. The approval columns
-- themselves (approved/approved_at/approved_by) may still be touched, so
-- un-approving (true -> false) is intentionally blocked too: re-approval flow
-- should delete + recreate, not silently mutate locked data.
CREATE OR REPLACE FUNCTION public.tr_block_update_when_approved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(OLD.approved, false) = true THEN
    IF (NEW.staff_id           IS DISTINCT FROM OLD.staff_id)
    OR (NEW.booking_id         IS DISTINCT FROM OLD.booking_id)
    OR (NEW.large_project_id   IS DISTINCT FROM OLD.large_project_id)
    OR (NEW.location_id        IS DISTINCT FROM OLD.location_id)
    OR (NEW.report_date        IS DISTINCT FROM OLD.report_date)
    OR (NEW.start_time         IS DISTINCT FROM OLD.start_time)
    OR (NEW.end_time           IS DISTINCT FROM OLD.end_time)
    OR (NEW.hours_worked       IS DISTINCT FROM OLD.hours_worked)
    OR (NEW.overtime_hours     IS DISTINCT FROM OLD.overtime_hours)
    OR (NEW.break_time         IS DISTINCT FROM OLD.break_time)
    OR (NEW.description        IS DISTINCT FROM OLD.description)
    OR (NEW.establishment_task_id IS DISTINCT FROM OLD.establishment_task_id)
    OR (NEW.source             IS DISTINCT FROM OLD.source)
    OR (NEW.source_entry_id    IS DISTINCT FROM OLD.source_entry_id)
    OR (NEW.organization_id    IS DISTINCT FROM OLD.organization_id)
    OR (COALESCE(NEW.approved, false) = false) THEN
      RAISE EXCEPTION 'Time report % is approved and cannot be modified', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_reports_approved_lock ON public.time_reports;
CREATE TRIGGER trg_time_reports_approved_lock
BEFORE UPDATE ON public.time_reports
FOR EACH ROW
EXECUTE FUNCTION public.tr_block_update_when_approved();

-- Approved rows cannot be deleted either
CREATE OR REPLACE FUNCTION public.tr_block_delete_when_approved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(OLD.approved, false) = true THEN
    RAISE EXCEPTION 'Time report % is approved and cannot be deleted', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_reports_approved_delete_lock ON public.time_reports;
CREATE TRIGGER trg_time_reports_approved_delete_lock
BEFORE DELETE ON public.time_reports
FOR EACH ROW
EXECUTE FUNCTION public.tr_block_delete_when_approved();

-- 2. OVERLAP PROTECTION (datetime-based, night-shift aware)
-- Only enforced when start_time AND end_time are set (manual entries always
-- have these; legacy summary rows without times are skipped).
-- 'location_auto' is exempt so geofence sync trigger stays idempotent.
CREATE OR REPLACE FUNCTION public.tr_prevent_time_report_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _new_range tstzrange;
  _conflict_id uuid;
BEGIN
  IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.source = 'location_auto' THEN
    RETURN NEW;
  END IF;

  _new_range := public.tr_shift_interval(NEW.report_date, NEW.start_time, NEW.end_time);
  IF _new_range IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look at neighboring days to catch night shifts bleeding across the date boundary.
  SELECT id INTO _conflict_id
  FROM public.time_reports tr
  WHERE tr.staff_id = NEW.staff_id
    AND tr.id IS DISTINCT FROM NEW.id
    AND tr.start_time IS NOT NULL
    AND tr.end_time   IS NOT NULL
    AND tr.source <> 'location_auto'
    AND tr.report_date BETWEEN (NEW.report_date - 1) AND (NEW.report_date + 1)
    AND public.tr_shift_interval(tr.report_date, tr.start_time, tr.end_time) && _new_range
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Time report overlaps existing report % for this staff member (night shifts included)', _conflict_id
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_reports_overlap ON public.time_reports;
CREATE TRIGGER trg_time_reports_overlap
BEFORE INSERT OR UPDATE OF report_date, start_time, end_time, staff_id ON public.time_reports
FOR EACH ROW
EXECUTE FUNCTION public.tr_prevent_time_report_overlap();