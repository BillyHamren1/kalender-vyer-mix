
CREATE OR REPLACE FUNCTION public.lp_rep_booking_id(_lp uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MIN(bid) FROM (
    SELECT booking_id AS bid FROM public.large_project_bookings WHERE large_project_id = _lp
    UNION
    SELECT id::text FROM public.bookings WHERE large_project_id = _lp
  ) s
  WHERE bid IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.cleanup_non_rep_lp_calendar_events(_booking_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lp uuid;
  v_rep text;
  v_deleted integer := 0;
BEGIN
  SELECT large_project_id INTO v_lp
  FROM public.large_project_bookings
  WHERE booking_id = _booking_id
  LIMIT 1;

  IF v_lp IS NULL THEN
    SELECT large_project_id INTO v_lp FROM public.bookings WHERE id::text = _booking_id;
  END IF;

  IF v_lp IS NULL THEN
    RETURN 0;
  END IF;

  v_rep := public.lp_rep_booking_id(v_lp);

  IF v_rep IS NULL OR v_rep = _booking_id THEN
    RETURN 0;
  END IF;

  WITH del AS (
    DELETE FROM public.calendar_events
    WHERE booking_id = _booking_id
      AND event_type IN ('rig','rigDown','event')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END
$$;

DO $$
DECLARE
  r RECORD;
  v_rep text;
  v_deleted integer;
  v_total integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.large_projects LOOP
    v_rep := public.lp_rep_booking_id(r.id);
    IF v_rep IS NULL THEN
      CONTINUE;
    END IF;

    WITH sibling_ids AS (
      SELECT booking_id AS bid FROM public.large_project_bookings WHERE large_project_id = r.id
      UNION
      SELECT id::text FROM public.bookings WHERE large_project_id = r.id
    ),
    del AS (
      DELETE FROM public.calendar_events ce
      USING sibling_ids s
      WHERE ce.booking_id = s.bid
        AND ce.booking_id <> v_rep
        AND ce.event_type IN ('rig','rigDown','event')
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM del;

    v_total := v_total + COALESCE(v_deleted, 0);
    IF v_deleted > 0 THEN
      RAISE NOTICE 'LP % rep=% deleted=%', r.id, v_rep, v_deleted;
    END IF;
  END LOOP;
  RAISE NOTICE 'Total stale LP calendar_events deleted: %', v_total;
END $$;

CREATE OR REPLACE FUNCTION public.trg_cleanup_lp_calendar_events_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cleanup_non_rep_lp_calendar_events(NEW.booking_id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS large_project_bookings_cleanup_calendar ON public.large_project_bookings;
CREATE TRIGGER large_project_bookings_cleanup_calendar
AFTER INSERT ON public.large_project_bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_cleanup_lp_calendar_events_on_link();

CREATE OR REPLACE FUNCTION public.trg_cleanup_lp_calendar_events_on_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.large_project_id IS DISTINCT FROM OLD.large_project_id AND NEW.large_project_id IS NOT NULL THEN
    PERFORM public.cleanup_non_rep_lp_calendar_events(NEW.id::text);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS bookings_cleanup_calendar_on_lp_change ON public.bookings;
CREATE TRIGGER bookings_cleanup_calendar_on_lp_change
AFTER UPDATE OF large_project_id ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_cleanup_lp_calendar_events_on_booking_update();
