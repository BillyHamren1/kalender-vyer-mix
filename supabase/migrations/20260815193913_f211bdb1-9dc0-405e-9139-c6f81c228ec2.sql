-- STEG 4R: tenant-safe BSA runtime logic (no data changes)

CREATE OR REPLACE FUNCTION public.sync_team_pool_to_booking_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_assignment_text text;
  v_org uuid;
begin
  if (tg_op = 'INSERT') then
    v_org := new.organization_id;
    if v_org is null then
      return new;
    end if;
    v_assignment_text := new.assignment_date::text;

    insert into public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date, role, organization_id)
    select distinct
      ce.booking_id, new.staff_id, new.team_id, new.assignment_date, 'field', b.organization_id
    from public.calendar_events ce
    join public.bookings b on b.id = ce.booking_id and b.organization_id = v_org
    where ce.organization_id = v_org
      and ce.resource_id = new.team_id
      and ce.booking_id is not null
      and coalesce(ce.source_date, (ce.start_time at time zone 'Europe/Stockholm')::date)
          = new.assignment_date
    on conflict (organization_id, booking_id, staff_id, assignment_date) do nothing;

    insert into public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date, role, organization_id)
    select distinct
      lpb.booking_id, new.staff_id, new.team_id, new.assignment_date, 'field', b.organization_id
    from public.large_projects lp
    join public.large_project_bookings lpb on lpb.large_project_id = lp.id
    join public.bookings b on b.id = lpb.booking_id and b.organization_id = v_org
    where lp.deleted_at is null
      and lp.organization_id = v_org
      and lpb.organization_id = v_org
      and (
        v_assignment_text = any(coalesce(lp.start_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.event_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.end_date,   '{}'::text[]))
      )
    on conflict (organization_id, booking_id, staff_id, assignment_date) do nothing;

    return new;

  elsif (tg_op = 'DELETE') then
    v_org := old.organization_id;
    if v_org is null then
      return old;
    end if;
    v_assignment_text := old.assignment_date::text;

    delete from public.booking_staff_assignments bsa
    where bsa.organization_id = v_org
      and bsa.staff_id = old.staff_id
      and bsa.team_id  = old.team_id
      and bsa.assignment_date = old.assignment_date
      and (
        exists (
          select 1 from public.calendar_events ce
          where ce.organization_id = v_org
            and ce.booking_id = bsa.booking_id
            and ce.resource_id = old.team_id
            and coalesce(ce.source_date, (ce.start_time at time zone 'Europe/Stockholm')::date)
                = old.assignment_date
        )
        or exists (
          select 1
          from public.large_project_bookings lpb
          join public.large_projects lp on lp.id = lpb.large_project_id
          where lpb.booking_id = bsa.booking_id
            and lpb.organization_id = v_org
            and lp.organization_id = v_org
            and lp.deleted_at is null
            and (
              v_assignment_text = any(coalesce(lp.start_date, '{}'::text[]))
              or v_assignment_text = any(coalesce(lp.event_date, '{}'::text[]))
              or v_assignment_text = any(coalesce(lp.end_date,   '{}'::text[]))
            )
        )
      );

    return old;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_task_assignments_to_bsa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _start_date date;
  _end_date date;
  _staff_ids text[];
  _org uuid;
BEGIN
  _booking_id := COALESCE(NEW.booking_id, NULL);
  _org := NEW.organization_id;
  IF _booking_id IS NULL OR _org IS NULL THEN
    RETURN NEW;
  END IF;

  _staff_ids := COALESCE(NEW.assigned_to_ids, ARRAY[]::text[]);
  _start_date := NEW.start_date::date;
  _end_date := NEW.end_date::date;

  IF TG_OP = 'UPDATE' THEN
    DECLARE
      _old_staff_ids text[] := COALESCE(OLD.assigned_to_ids, ARRAY[]::text[]);
      _removed text[];
    BEGIN
      SELECT ARRAY(
        SELECT unnest(_old_staff_ids)
        EXCEPT
        SELECT unnest(_staff_ids)
      ) INTO _removed;

      IF array_length(_removed, 1) > 0 THEN
        DELETE FROM public.booking_staff_assignments
        WHERE organization_id = _org
          AND booking_id = _booking_id::text
          AND team_id = 'activity'
          AND staff_id = ANY(_removed)
          AND assignment_date >= OLD.start_date::date
          AND assignment_date <= OLD.end_date::date
          AND NOT EXISTS (
            SELECT 1 FROM public.establishment_tasks et
            WHERE et.booking_id = _booking_id
              AND et.organization_id = _org
              AND et.id != NEW.id
              AND booking_staff_assignments.staff_id = ANY(et.assigned_to_ids)
              AND booking_staff_assignments.assignment_date >= et.start_date::date
              AND booking_staff_assignments.assignment_date <= et.end_date::date
          );
      END IF;
    END;
  END IF;

  IF array_length(_staff_ids, 1) > 0 THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT _booking_id::text, s.staff_id, 'activity', d.d, _org
    FROM unnest(_staff_ids) AS s(staff_id)
    CROSS JOIN generate_series(_start_date, _end_date, '1 day'::interval) AS d(d)
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_task_bsa_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _staff_ids text[] := COALESCE(OLD.assigned_to_ids, ARRAY[]::text[]);
  _org uuid := OLD.organization_id;
BEGIN
  IF OLD.booking_id IS NULL OR _org IS NULL OR array_length(_staff_ids, 1) IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.booking_staff_assignments
  WHERE organization_id = _org
    AND booking_id = OLD.booking_id::text
    AND team_id = 'activity'
    AND staff_id = ANY(_staff_ids)
    AND assignment_date >= OLD.start_date::date
    AND assignment_date <= OLD.end_date::date
    AND NOT EXISTS (
      SELECT 1 FROM public.establishment_tasks et
      WHERE et.booking_id = OLD.booking_id
        AND et.organization_id = _org
        AND et.id != OLD.id
        AND booking_staff_assignments.staff_id = ANY(et.assigned_to_ids)
        AND booking_staff_assignments.assignment_date >= et.start_date::date
        AND booking_staff_assignments.assignment_date <= et.end_date::date
    );

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_location_project_bsa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.show_as_project = true AND (TG_OP = 'INSERT' OR OLD.show_as_project = false) THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT 'location-' || NEW.id, sm.id, 'location', CURRENT_DATE, NEW.organization_id
    FROM public.staff_members sm
    WHERE sm.organization_id = NEW.organization_id AND sm.is_active = true
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  IF NEW.show_as_project = false AND TG_OP = 'UPDATE' AND OLD.show_as_project = true THEN
    DELETE FROM public.booking_staff_assignments
    WHERE organization_id = NEW.organization_id
      AND booking_id = 'location-' || NEW.id
      AND team_id = 'location';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_bsa_on_new_project_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lpb RECORD;
  _booking RECORD;
  _dates date[];
  _d date;
BEGIN
  FOR _lpb IN
    SELECT lpb.booking_id, lpb.organization_id
    FROM public.large_project_bookings lpb
    WHERE lpb.large_project_id = NEW.large_project_id
      AND lpb.organization_id = NEW.organization_id
  LOOP
    IF _lpb.organization_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT rigdaydate, eventdate, rigdowndate INTO _booking
    FROM public.bookings
    WHERE id = _lpb.booking_id AND organization_id = _lpb.organization_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    _dates := ARRAY[]::date[];
    IF _booking.rigdaydate IS NOT NULL THEN _dates := _dates || _booking.rigdaydate::date; END IF;
    IF _booking.eventdate IS NOT NULL THEN _dates := _dates || _booking.eventdate::date; END IF;
    IF _booking.rigdowndate IS NOT NULL THEN _dates := _dates || _booking.rigdowndate::date; END IF;

    FOREACH _d IN ARRAY _dates LOOP
      INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
      VALUES (_lpb.booking_id, NEW.staff_id, 'project', _d, _lpb.organization_id)
      ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

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
  WHERE id = NEW.booking_id AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  _dates := ARRAY[]::date[];
  IF _booking.rigdaydate IS NOT NULL THEN _dates := _dates || _booking.rigdaydate::date; END IF;
  IF _booking.eventdate IS NOT NULL THEN _dates := _dates || _booking.eventdate::date; END IF;
  IF _booking.rigdowndate IS NOT NULL THEN _dates := _dates || _booking.rigdowndate::date; END IF;

  FOR _staff IN
    SELECT staff_id FROM public.large_project_staff
    WHERE large_project_id = NEW.large_project_id
      AND organization_id = NEW.organization_id
  LOOP
    FOREACH _d IN ARRAY _dates LOOP
      INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
      VALUES (NEW.booking_id, _staff.staff_id, 'project', _d, NEW.organization_id)
      ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Legacy funktion utan aktiv trigger: gör tenant-safe och stäng klientytan
CREATE OR REPLACE FUNCTION public.sync_booking_staff_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid;
BEGIN
  IF TG_TABLE_NAME = 'staff_assignments' THEN
    _org := COALESCE(NEW.organization_id, OLD.organization_id);
    IF _org IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      DELETE FROM public.booking_staff_assignments
      WHERE organization_id = OLD.organization_id
        AND staff_id = OLD.staff_id
        AND team_id = OLD.team_id
        AND assignment_date = OLD.assignment_date;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
    END IF;

    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT DISTINCT ce.booking_id, NEW.staff_id, NEW.team_id, NEW.assignment_date, NEW.organization_id
    FROM public.calendar_events ce
    WHERE ce.organization_id = NEW.organization_id
      AND ce.resource_id = NEW.team_id
      AND ce.booking_id IS NOT NULL
      AND COALESCE(ce.source_date, DATE(ce.start_time)) = NEW.assignment_date
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'calendar_events' THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id) THEN
      IF OLD.organization_id IS NOT NULL AND OLD.booking_id IS NOT NULL THEN
        DELETE FROM public.booking_staff_assignments
        WHERE organization_id = OLD.organization_id
          AND booking_id = OLD.booking_id
          AND assignment_date = COALESCE(OLD.source_date, DATE(OLD.start_time));
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
    END IF;

    IF NEW.booking_id IS NULL OR NEW.organization_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT DISTINCT NEW.booking_id, sa.staff_id, sa.team_id, sa.assignment_date, NEW.organization_id
    FROM public.staff_assignments sa
    WHERE sa.organization_id = NEW.organization_id
      AND sa.team_id = NEW.resource_id
      AND sa.assignment_date = COALESCE(NEW.source_date, DATE(NEW.start_time))
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_booking_staff_assignments() FROM PUBLIC, anon, authenticated;