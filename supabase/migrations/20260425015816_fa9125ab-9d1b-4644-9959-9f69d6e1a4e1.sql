-- ============================================================
-- A0. Drop the harmful old unique index that uses start_time as identity.
-- This index forced the reconciler to delete + recreate rows whenever a
-- time was adjusted, contributing to flicker for booking 2604-127.
-- The good index (uq_calendar_event_identity on
-- (booking_id, event_type, source_date, organization_id) WHERE event_type<>'activity')
-- already exists and is the correct identity.
-- ============================================================
DROP INDEX IF EXISTS public.unique_booking_event_time;

-- ============================================================
-- A3. Protect activities from accidental deletion by reconciler
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_activity_calendar_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allow boolean := false;
BEGIN
  IF OLD.event_type = 'activity' THEN
    BEGIN
      _allow := (current_setting('app.allow_activity_delete', true) = 'true');
    EXCEPTION WHEN OTHERS THEN
      _allow := false;
    END;
    IF NOT _allow THEN
      RAISE EXCEPTION 'calendar_events.event_type=activity rows can only be deleted via the activity sync (set app.allow_activity_delete=true)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_activity_calendar_events ON public.calendar_events;
CREATE TRIGGER trg_protect_activity_calendar_events
BEFORE DELETE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.protect_activity_calendar_events();

-- ============================================================
-- A4a. Core upsert helper used by trigger AND backfill
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_task_calendar_event(_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t record;
  _calendar_booking_id text;
  _booking_number text := NULL;
  _delivery_address text := NULL;
  _start_date date;
  _end_date date;
  _start_time text;
  _end_time text;
  _start_ts timestamptz;
  _end_ts timestamptz;
  _type_label text;
  _title text;
  _new_event_id uuid;
  _b record;
  _lp record;
BEGIN
  SELECT id, title, task_type, start_date, end_date, start_time, end_time,
         due_date, booking_id, large_project_id, organization_id, calendar_event_id
    INTO _t
    FROM public.establishment_tasks WHERE id = _task_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- No date → if previously linked, delete event
  IF _t.start_date IS NULL AND _t.due_date IS NULL THEN
    IF _t.calendar_event_id IS NOT NULL THEN
      PERFORM set_config('app.allow_activity_delete', 'true', true);
      DELETE FROM public.calendar_events WHERE id = _t.calendar_event_id;
      PERFORM set_config('app.allow_activity_delete', 'false', true);
      UPDATE public.establishment_tasks SET calendar_event_id = NULL WHERE id = _task_id;
    END IF;
    RETURN NULL;
  END IF;

  -- Resolve anchor
  IF _t.booking_id IS NOT NULL THEN
    SELECT booking_number, deliveryaddress, delivery_city
      INTO _b FROM public.bookings WHERE id = _t.booking_id;
    _calendar_booking_id := _t.booking_id::text;
    _booking_number := _b.booking_number;
    _delivery_address := nullif(concat_ws(', ', _b.deliveryaddress, _b.delivery_city), '');
  ELSIF _t.large_project_id IS NOT NULL THEN
    _calendar_booking_id := 'project-' || _t.large_project_id::text;
    SELECT project_number, address, address_city
      INTO _lp FROM public.large_projects WHERE id = _t.large_project_id;
    _booking_number := _lp.project_number;
    _delivery_address := nullif(concat_ws(', ', _lp.address, _lp.address_city), '');
  ELSE
    RETURN NULL;
  END IF;

  _start_date := COALESCE(_t.start_date, _t.due_date::date);
  _end_date := COALESCE(_t.end_date, _t.start_date, _t.due_date::date);
  _start_time := COALESCE(NULLIF(_t.start_time, ''), '08:00');
  _end_time := COALESCE(NULLIF(_t.end_time, ''), '16:00');
  IF length(_start_time) = 5 THEN _start_time := _start_time || ':00'; END IF;
  IF length(_end_time) = 5 THEN _end_time := _end_time || ':00'; END IF;

  _start_ts := (_start_date::text || 'T' || _start_time)::timestamptz;
  _end_ts := (_end_date::text || 'T' || _end_time)::timestamptz;

  _type_label := CASE COALESCE(_t.task_type, 'crew')
                   WHEN 'crew' THEN 'Fält'
                   WHEN 'pm' THEN 'PL'
                   WHEN 'logistics' THEN 'Logistik'
                   WHEN 'admin' THEN 'Admin'
                   ELSE 'Aktivitet'
                 END;
  _title := '[' || _type_label || '] ' || COALESCE(_t.title, 'Aktivitet');

  -- If linked, try update
  IF _t.calendar_event_id IS NOT NULL THEN
    UPDATE public.calendar_events
       SET title = _title,
           start_time = _start_ts,
           end_time = _end_ts,
           resource_id = 'transport',
           booking_id = _calendar_booking_id,
           booking_number = _booking_number,
           delivery_address = COALESCE(_delivery_address, ''),
           source_date = _start_date
     WHERE id = _t.calendar_event_id
     RETURNING id INTO _new_event_id;

    IF _new_event_id IS NOT NULL THEN
      RETURN _new_event_id;
    END IF;
  END IF;

  -- Insert (no conflict expected since activity rows aren't in the partial unique index)
  INSERT INTO public.calendar_events (
    title, start_time, end_time, resource_id, event_type,
    booking_id, booking_number, delivery_address,
    organization_id, source_date
  ) VALUES (
    _title, _start_ts, _end_ts, 'transport', 'activity',
    _calendar_booking_id, _booking_number, COALESCE(_delivery_address, ''),
    _t.organization_id, _start_date
  )
  RETURNING id INTO _new_event_id;

  IF _new_event_id IS NOT NULL THEN
    UPDATE public.establishment_tasks SET calendar_event_id = _new_event_id WHERE id = _task_id;
  END IF;

  RETURN _new_event_id;
END;
$$;

-- ============================================================
-- A4b. Trigger function (thin wrapper around the helper)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_task_to_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.calendar_event_id IS NOT NULL THEN
      PERFORM set_config('app.allow_activity_delete', 'true', true);
      DELETE FROM public.calendar_events WHERE id = OLD.calendar_event_id;
      PERFORM set_config('app.allow_activity_delete', 'false', true);
    END IF;
    RETURN OLD;
  END IF;

  PERFORM public.upsert_task_calendar_event(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_to_calendar_ins ON public.establishment_tasks;
DROP TRIGGER IF EXISTS trg_sync_task_to_calendar_upd ON public.establishment_tasks;
DROP TRIGGER IF EXISTS trg_sync_task_to_calendar_del ON public.establishment_tasks;

CREATE TRIGGER trg_sync_task_to_calendar_ins
AFTER INSERT ON public.establishment_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_to_calendar();

CREATE TRIGGER trg_sync_task_to_calendar_upd
AFTER UPDATE ON public.establishment_tasks
FOR EACH ROW
WHEN (
  OLD.title IS DISTINCT FROM NEW.title OR
  OLD.task_type IS DISTINCT FROM NEW.task_type OR
  OLD.start_date IS DISTINCT FROM NEW.start_date OR
  OLD.end_date IS DISTINCT FROM NEW.end_date OR
  OLD.start_time IS DISTINCT FROM NEW.start_time OR
  OLD.end_time IS DISTINCT FROM NEW.end_time OR
  OLD.due_date IS DISTINCT FROM NEW.due_date OR
  OLD.booking_id IS DISTINCT FROM NEW.booking_id OR
  OLD.large_project_id IS DISTINCT FROM NEW.large_project_id
)
EXECUTE FUNCTION public.sync_task_to_calendar();

CREATE TRIGGER trg_sync_task_to_calendar_del
BEFORE DELETE ON public.establishment_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_to_calendar();

-- ============================================================
-- A5. Backfill the 201 unsynced activities
-- ============================================================
DO $$
DECLARE
  _t record;
  _count int := 0;
BEGIN
  FOR _t IN
    SELECT id FROM public.establishment_tasks
     WHERE calendar_event_id IS NULL
       AND (start_date IS NOT NULL OR due_date IS NOT NULL)
       AND (booking_id IS NOT NULL OR large_project_id IS NOT NULL)
  LOOP
    PERFORM public.upsert_task_calendar_event(_t.id);
    _count := _count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled % task calendar events', _count;
END $$;
