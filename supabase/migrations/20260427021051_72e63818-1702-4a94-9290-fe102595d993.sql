-- Allow staff members to be assigned to multiple teams on the same date.
-- Replaces the old (staff_id, assignment_date) unique constraint with
-- (staff_id, team_id, assignment_date) so the same person can sit in
-- several teams the same day, but never the same team twice.

-- 1) Drop old unique constraint
ALTER TABLE public.staff_assignments
  DROP CONSTRAINT IF EXISTS staff_assignments_staff_id_assignment_date_key;

-- 2) Clean any pre-existing exact duplicates for the new key (keep oldest)
DELETE FROM public.staff_assignments a
USING public.staff_assignments b
WHERE a.ctid > b.ctid
  AND a.staff_id = b.staff_id
  AND a.team_id = b.team_id
  AND a.assignment_date = b.assignment_date;

-- 3) Add new composite unique constraint
ALTER TABLE public.staff_assignments
  ADD CONSTRAINT staff_assignments_staff_team_date_key
  UNIQUE (staff_id, team_id, assignment_date);

-- 4) Update sync trigger so DELETE/UPDATE only clears BSA rows for the
--    affected team, not every team the staff is in that day.
CREATE OR REPLACE FUNCTION public.sync_booking_staff_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'staff_assignments' THEN
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id
        AND team_id = OLD.team_id
        AND assignment_date = OLD.assignment_date;
    END IF;
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id
        AND team_id = OLD.team_id
        AND assignment_date = OLD.assignment_date;
      RETURN OLD;
    END IF;
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT DISTINCT ce.booking_id, NEW.staff_id, NEW.team_id, NEW.assignment_date
    FROM public.calendar_events ce
    WHERE ce.resource_id = NEW.team_id
      AND ce.booking_id IS NOT NULL
      AND DATE(ce.start_time) = NEW.assignment_date
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'calendar_events' THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id) THEN
      DELETE FROM public.booking_staff_assignments
      WHERE booking_id = OLD.booking_id AND assignment_date = DATE(OLD.start_time);
    END IF;
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.booking_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT DISTINCT NEW.booking_id, sa.staff_id, sa.team_id, sa.assignment_date
    FROM public.staff_assignments sa
    WHERE sa.team_id = NEW.resource_id AND sa.assignment_date = DATE(NEW.start_time)
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;