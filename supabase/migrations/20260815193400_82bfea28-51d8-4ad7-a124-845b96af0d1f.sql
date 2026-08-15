-- STEG 4Q — drop legacy global BSA unique identity. Schema only, no data mutation.
DO $guard$
DECLARE
  v_dupes int;
  v_null_org int;
  v_has_tenant_idx boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='booking_staff_assignments'
      AND indexname='booking_staff_assignments_org_booking_staff_date_uidx'
  ) INTO v_has_tenant_idx;
  IF NOT v_has_tenant_idx THEN
    RAISE EXCEPTION 'STEG 4Q ABORT: tenant-safe index saknas';
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT 1 FROM public.booking_staff_assignments
    GROUP BY organization_id, booking_id, staff_id, assignment_date
    HAVING count(*) > 1
  ) t;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'STEG 4Q ABORT: % tenant-safe duplicates', v_dupes;
  END IF;

  SELECT count(*) INTO v_null_org FROM public.booking_staff_assignments WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'STEG 4Q ABORT: % rader utan organization_id', v_null_org;
  END IF;
END
$guard$;

-- 1) Flytta alla ON CONFLICT-targets till den tenant-säkra nyckeln
CREATE OR REPLACE FUNCTION public.recompute_booking_staff_for_day(p_booking_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team    text;
  v_org     uuid;
  v_added   int := 0;
  v_removed int := 0;
BEGIN
  SELECT resource_id, organization_id
    INTO v_team, v_org
  FROM public.calendar_events
  WHERE booking_id  = p_booking_id
    AND source_date = p_date
    AND event_type IN ('rig','rigDown')
  ORDER BY event_type DESC
  LIMIT 1;

  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org
    FROM public.booking_staff_assignments
    WHERE booking_id = p_booking_id AND assignment_date = p_date
    LIMIT 1;
  END IF;

  WITH removed AS (
    DELETE FROM public.booking_staff_assignments
    WHERE booking_id      = p_booking_id
      AND assignment_date = p_date
      AND team_id NOT IN ('activity','project','location')
      AND (
            v_team IS NULL
         OR team_id <> v_team
         OR staff_id NOT IN (
              SELECT sa.staff_id FROM public.staff_assignments sa
              WHERE sa.team_id = v_team AND sa.assignment_date = p_date
            )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM removed;

  IF v_team IS NOT NULL AND v_org IS NOT NULL THEN
    WITH added AS (
      INSERT INTO public.booking_staff_assignments
        (booking_id, staff_id, team_id, assignment_date, organization_id)
      SELECT p_booking_id, sa.staff_id, v_team, p_date, v_org
      FROM public.staff_assignments sa
      WHERE sa.team_id = v_team AND sa.assignment_date = p_date
      ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_added FROM added;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'date',       p_date,
    'team',       v_team,
    'added',      v_added,
    'removed',    v_removed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_booking_staff_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'staff_assignments' THEN
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id AND team_id = OLD.team_id AND assignment_date = OLD.assignment_date;
    END IF;
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.booking_staff_assignments
      WHERE staff_id = OLD.staff_id AND team_id = OLD.team_id AND assignment_date = OLD.assignment_date;
      RETURN OLD;
    END IF;
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT DISTINCT ce.booking_id, NEW.staff_id, NEW.team_id, NEW.assignment_date
    FROM public.calendar_events ce
    WHERE ce.resource_id = NEW.team_id
      AND ce.booking_id IS NOT NULL
      AND DATE(ce.start_time) = NEW.assignment_date
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
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
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NULL;
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
  LOOP
    SELECT rigdaydate, eventdate, rigdowndate INTO _booking
    FROM public.bookings WHERE id = _lpb.booking_id;

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

CREATE OR REPLACE FUNCTION public.sync_location_project_bsa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.show_as_project = true AND (TG_OP = 'INSERT' OR OLD.show_as_project = false) THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT 'location-' || NEW.id, sm.id, 'location', CURRENT_DATE, NEW.organization_id
    FROM public.staff_members sm
    WHERE sm.organization_id = NEW.organization_id AND sm.is_active = true
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  IF NEW.show_as_project = false AND TG_OP = 'UPDATE' AND OLD.show_as_project = true THEN
    DELETE FROM public.booking_staff_assignments
    WHERE booking_id = 'location-' || NEW.id AND team_id = 'location';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_new_staff_to_location_projects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT 'location-' || ol.id, NEW.id, 'location', CURRENT_DATE, NEW.organization_id
    FROM public.organization_locations ol
    WHERE ol.organization_id = NEW.organization_id
      AND ol.is_active = true
      AND ol.show_as_project = true
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;
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
  SELECT rigdaydate, eventdate, rigdowndate INTO _booking
  FROM public.bookings WHERE id = NEW.booking_id;

  _dates := ARRAY[]::date[];
  IF _booking.rigdaydate IS NOT NULL THEN _dates := _dates || _booking.rigdaydate::date; END IF;
  IF _booking.eventdate IS NOT NULL THEN _dates := _dates || _booking.eventdate::date; END IF;
  IF _booking.rigdowndate IS NOT NULL THEN _dates := _dates || _booking.rigdowndate::date; END IF;

  FOR _staff IN
    SELECT staff_id FROM public.large_project_staff WHERE large_project_id = NEW.large_project_id
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
BEGIN
  _booking_id := COALESCE(NEW.booking_id, NULL);
  IF _booking_id IS NULL THEN
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
        WHERE booking_id = _booking_id::text
          AND team_id = 'activity'
          AND staff_id = ANY(_removed)
          AND assignment_date >= OLD.start_date::date
          AND assignment_date <= OLD.end_date::date
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

  IF array_length(_staff_ids, 1) > 0 THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT _booking_id::text, s.staff_id, 'activity', d.d
    FROM unnest(_staff_ids) AS s(staff_id)
    CROSS JOIN generate_series(_start_date, _end_date, '1 day'::interval) AS d(d)
    ON CONFLICT (organization_id, booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_team_pool_to_booking_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_assignment_text text;
begin
  if (tg_op = 'INSERT') then
    v_assignment_text := new.assignment_date::text;

    insert into public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date, role, organization_id)
    select distinct
      ce.booking_id, new.staff_id, new.team_id, new.assignment_date, 'field', b.organization_id
    from public.calendar_events ce
    join public.bookings b on b.id = ce.booking_id
    where ce.resource_id = new.team_id
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
    join public.bookings b on b.id = lpb.booking_id
    where lp.deleted_at is null
      and (
        v_assignment_text = any(coalesce(lp.start_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.event_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.end_date,   '{}'::text[]))
      )
    on conflict (organization_id, booking_id, staff_id, assignment_date) do nothing;

    return new;

  elsif (tg_op = 'DELETE') then
    v_assignment_text := old.assignment_date::text;

    delete from public.booking_staff_assignments bsa
    where bsa.staff_id = old.staff_id
      and bsa.team_id  = old.team_id
      and bsa.assignment_date = old.assignment_date
      and (
        exists (
          select 1 from public.calendar_events ce
          where ce.booking_id = bsa.booking_id
            and ce.resource_id = old.team_id
            and coalesce(ce.source_date, (ce.start_time at time zone 'Europe/Stockholm')::date)
                = old.assignment_date
        )
        or exists (
          select 1
          from public.large_project_bookings lpb
          join public.large_projects lp on lp.id = lpb.large_project_id
          where lpb.booking_id = bsa.booking_id
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

-- 2) Droppa den globala legacy-unikheten (constraint äger indexet)
ALTER TABLE public.booking_staff_assignments
  DROP CONSTRAINT IF EXISTS booking_staff_assignments_booking_id_staff_id_assignment_da_key;

DROP INDEX IF EXISTS public.booking_staff_assignments_booking_id_staff_id_assignment_da_key;

-- 3) Slutverifiering
DO $verify$
DECLARE v_legacy int;
BEGIN
  SELECT count(*) INTO v_legacy
  FROM pg_indexes
  WHERE schemaname='public' AND tablename='booking_staff_assignments'
    AND indexdef ILIKE '%UNIQUE%'
    AND indexdef ILIKE '%(booking_id, staff_id, assignment_date)%'
    AND indexdef NOT ILIKE '%organization_id%';
  IF v_legacy > 0 THEN
    RAISE EXCEPTION 'STEG 4Q: legacy global unique finns kvar';
  END IF;
END
$verify$;