
-- 1. Create the large_project_staff table
CREATE TABLE public.large_project_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id uuid NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  staff_id text NOT NULL,
  role text NOT NULL DEFAULT 'field',
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id text NOT NULL,
  UNIQUE (large_project_id, staff_id)
);

-- 2. Enable RLS
ALTER TABLE public.large_project_staff ENABLE ROW LEVEL SECURITY;

-- 3. Set org trigger
CREATE TRIGGER set_large_project_staff_org
  BEFORE INSERT ON public.large_project_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_id();

-- 4. RLS policies
CREATE POLICY "Users can view project staff in their org"
  ON public.large_project_staff FOR SELECT
  TO authenticated
  USING (organization_id = (SELECT get_user_organization_id(auth.uid()))::text);

CREATE POLICY "Users can insert project staff in their org"
  ON public.large_project_staff FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = (SELECT get_user_organization_id(auth.uid()))::text);

CREATE POLICY "Users can delete project staff in their org"
  ON public.large_project_staff FOR DELETE
  TO authenticated
  USING (organization_id = (SELECT get_user_organization_id(auth.uid()))::text);

-- 5. Trigger function: when a booking is added to a large project, create BSA rows for all project staff
CREATE OR REPLACE FUNCTION public.sync_project_staff_on_new_booking()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _booking RECORD;
  _staff RECORD;
  _dates date[];
  _d date;
BEGIN
  -- Get the booking's dates
  SELECT rigdaydate, eventdate, rigdowndate
  INTO _booking
  FROM public.bookings
  WHERE id = NEW.booking_id;

  -- Collect non-null dates
  _dates := ARRAY[]::date[];
  IF _booking.rigdaydate IS NOT NULL THEN
    _dates := _dates || _booking.rigdaydate::date;
  END IF;
  IF _booking.eventdate IS NOT NULL THEN
    _dates := _dates || _booking.eventdate::date;
  END IF;
  IF _booking.rigdowndate IS NOT NULL THEN
    _dates := _dates || _booking.rigdowndate::date;
  END IF;

  -- For each project staff member, insert BSA rows for each date
  FOR _staff IN
    SELECT staff_id FROM public.large_project_staff
    WHERE large_project_id = NEW.large_project_id
  LOOP
    FOREACH _d IN ARRAY _dates LOOP
      INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
      VALUES (NEW.booking_id, _staff.staff_id, 'project', _d, NEW.organization_id)
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_project_staff_on_new_booking
  AFTER INSERT ON public.large_project_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_project_staff_on_new_booking();

-- 6. Trigger function: when staff is added to a project, create BSA rows for all existing bookings
CREATE OR REPLACE FUNCTION public.sync_bsa_on_new_project_staff()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _lpb RECORD;
  _booking RECORD;
  _dates date[];
  _d date;
BEGIN
  -- For each booking in the project
  FOR _lpb IN
    SELECT lpb.booking_id, lpb.organization_id
    FROM public.large_project_bookings lpb
    WHERE lpb.large_project_id = NEW.large_project_id
  LOOP
    -- Get booking dates
    SELECT rigdaydate, eventdate, rigdowndate
    INTO _booking
    FROM public.bookings
    WHERE id = _lpb.booking_id;

    _dates := ARRAY[]::date[];
    IF _booking.rigdaydate IS NOT NULL THEN
      _dates := _dates || _booking.rigdaydate::date;
    END IF;
    IF _booking.eventdate IS NOT NULL THEN
      _dates := _dates || _booking.eventdate::date;
    END IF;
    IF _booking.rigdowndate IS NOT NULL THEN
      _dates := _dates || _booking.rigdowndate::date;
    END IF;

    FOREACH _d IN ARRAY _dates LOOP
      INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
      VALUES (_lpb.booking_id, NEW.staff_id, 'project', _d, _lpb.organization_id)
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_bsa_on_new_project_staff
  AFTER INSERT ON public.large_project_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bsa_on_new_project_staff();

-- 7. Index for performance
CREATE INDEX idx_large_project_staff_project ON public.large_project_staff (large_project_id);
CREATE INDEX idx_large_project_staff_org ON public.large_project_staff (organization_id);
