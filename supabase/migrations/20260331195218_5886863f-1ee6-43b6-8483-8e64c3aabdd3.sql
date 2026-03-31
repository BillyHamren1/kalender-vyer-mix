
-- Trigger function: sync establishment_tasks.assigned_to_ids → booking_staff_assignments
CREATE OR REPLACE FUNCTION public.sync_task_assignments_to_bsa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking_id uuid;
  _start_date date;
  _end_date date;
  _staff_ids text[];
  _staff_id text;
  _d date;
BEGIN
  -- Only act when there's a booking_id (project-level tasks don't need BSA)
  _booking_id := COALESCE(NEW.booking_id, NULL);
  IF _booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  _staff_ids := COALESCE(NEW.assigned_to_ids, ARRAY[]::text[]);
  _start_date := NEW.start_date::date;
  _end_date := NEW.end_date::date;

  -- On UPDATE: if assigned_to_ids changed, remove old activity-based BSA rows
  -- that are no longer relevant (staff removed from this task)
  IF TG_OP = 'UPDATE' THEN
    DECLARE
      _old_staff_ids text[] := COALESCE(OLD.assigned_to_ids, ARRAY[]::text[]);
      _removed text[];
    BEGIN
      -- Find staff IDs that were removed
      SELECT ARRAY(
        SELECT unnest(_old_staff_ids)
        EXCEPT
        SELECT unnest(_staff_ids)
      ) INTO _removed;

      -- Only delete activity-based BSA rows for removed staff
      -- (don't touch team-scheduled rows)
      IF array_length(_removed, 1) > 0 THEN
        DELETE FROM public.booking_staff_assignments
        WHERE booking_id = _booking_id::text
          AND team_id = 'activity'
          AND staff_id = ANY(_removed)
          AND assignment_date >= OLD.start_date::date
          AND assignment_date <= OLD.end_date::date
          -- Only delete if this staff member has no OTHER tasks on this booking
          AND NOT EXISTS (
            SELECT 1 FROM public.establishment_tasks et
            WHERE et.booking_id = _booking_id
              AND et.id != NEW.id
              AND booking_staff_assignments.staff_id = ANY(et.assigned_to_ids)
              AND booking_staff_assignments.assignment_date >= et.start_date::date
              AND booking_staff_assignments.assignment_date <= et.end_date::date
          );
      END IF;
    END;
  END IF;

  -- Insert BSA rows for all currently assigned staff across the date range
  IF array_length(_staff_ids, 1) > 0 THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT _booking_id::text, s.staff_id, 'activity', d.d
    FROM unnest(_staff_ids) AS s(staff_id)
    CROSS JOIN generate_series(_start_date, _end_date, '1 day'::interval) AS d(d)
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on establishment_tasks
DROP TRIGGER IF EXISTS trg_sync_task_to_bsa ON public.establishment_tasks;
CREATE TRIGGER trg_sync_task_to_bsa
  AFTER INSERT OR UPDATE OF assigned_to_ids, start_date, end_date, booking_id
  ON public.establishment_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_assignments_to_bsa();

-- Also handle DELETE: clean up activity-based BSA rows
CREATE OR REPLACE FUNCTION public.cleanup_task_bsa_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _staff_ids text[] := COALESCE(OLD.assigned_to_ids, ARRAY[]::text[]);
BEGIN
  IF OLD.booking_id IS NULL OR array_length(_staff_ids, 1) IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.booking_staff_assignments
  WHERE booking_id = OLD.booking_id::text
    AND team_id = 'activity'
    AND staff_id = ANY(_staff_ids)
    AND assignment_date >= OLD.start_date::date
    AND assignment_date <= OLD.end_date::date
    -- Only delete if no other task keeps this assignment alive
    AND NOT EXISTS (
      SELECT 1 FROM public.establishment_tasks et
      WHERE et.booking_id = OLD.booking_id
        AND et.id != OLD.id
        AND booking_staff_assignments.staff_id = ANY(et.assigned_to_ids)
        AND booking_staff_assignments.assignment_date >= et.start_date::date
        AND booking_staff_assignments.assignment_date <= et.end_date::date
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_task_bsa ON public.establishment_tasks;
CREATE TRIGGER trg_cleanup_task_bsa
  AFTER DELETE
  ON public.establishment_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_task_bsa_on_delete();
