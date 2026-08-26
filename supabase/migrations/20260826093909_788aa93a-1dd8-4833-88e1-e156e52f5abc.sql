CREATE OR REPLACE FUNCTION public.sync_project_staff_on_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking RECORD;
  _staff RECORD;
  _dates date[];
  _d date;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rigdaydate, eventdate, rigdowndate INTO _booking
  FROM public.bookings
  WHERE id = NEW.booking_id
    AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  _dates := ARRAY[]::date[];
  IF _booking.rigdaydate IS NOT NULL THEN _dates := _dates || _booking.rigdaydate::date; END IF;
  IF _booking.eventdate IS NOT NULL THEN _dates := _dates || _booking.eventdate::date; END IF;
  IF _booking.rigdowndate IS NOT NULL THEN _dates := _dates || _booking.rigdowndate::date; END IF;

  FOR _staff IN
    SELECT staff_id
    FROM public.large_project_staff
    WHERE large_project_id = NEW.large_project_id
      AND organization_id = NEW.organization_id::text
  LOOP
    FOREACH _d IN ARRAY _dates LOOP
      INSERT INTO public.booking_staff_assignments (
        booking_id,
        staff_id,
        team_id,
        assignment_date,
        organization_id
      )
      VALUES (
        NEW.booking_id,
        _staff.staff_id,
        'project',
        _d,
        NEW.organization_id
      )
      ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;