CREATE OR REPLACE FUNCTION public.sync_booking_staff_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'staff_assignments' THEN
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id
        AND assignment_date = OLD.assignment_date;
    END IF;

    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id
        AND assignment_date = OLD.assignment_date;
      RETURN OLD;
    END IF;

    INSERT INTO public.booking_staff_assignments (
      booking_id,
      staff_id,
      team_id,
      assignment_date,
      organization_id
    )
    SELECT DISTINCT
      ce.booking_id,
      NEW.staff_id,
      NEW.team_id,
      NEW.assignment_date,
      ce.organization_id
    FROM public.calendar_events ce
    WHERE ce.resource_id = NEW.team_id
      AND ce.booking_id IS NOT NULL
      AND DATE(ce.start_time) = NEW.assignment_date
      AND ce.organization_id IS NOT NULL
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'calendar_events' THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id) THEN
      DELETE FROM public.booking_staff_assignments
      WHERE booking_id = OLD.booking_id
        AND assignment_date = DATE(OLD.start_time);
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.booking_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.booking_staff_assignments (
      booking_id,
      staff_id,
      team_id,
      assignment_date,
      organization_id
    )
    SELECT DISTINCT
      NEW.booking_id,
      sa.staff_id,
      sa.team_id,
      sa.assignment_date,
      NEW.organization_id
    FROM public.staff_assignments sa
    WHERE sa.team_id = NEW.resource_id
      AND sa.assignment_date = DATE(NEW.start_time)
      AND NEW.organization_id IS NOT NULL
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;