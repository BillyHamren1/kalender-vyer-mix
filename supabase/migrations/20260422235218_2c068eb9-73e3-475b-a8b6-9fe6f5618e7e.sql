-- 1. Uppdatera compute-funktionen att gruppera dagar i UTC (matchar klient + tester)
CREATE OR REPLACE FUNCTION public.compute_workday_review_status(p_workday_id uuid)
RETURNS public.workday_review_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workday public.workdays%ROWTYPE;
  v_reasons text[] := '{}';
  v_open_events int := 0;
  v_stale_review int := 0;
  v_open_travel int := 0;
  v_missed int := 0;
  v_day_start timestamptz;
  v_status public.workday_review_status;
BEGIN
  SELECT * INTO v_workday FROM public.workdays WHERE id = p_workday_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_workday.review_status = 'approved' THEN
    RETURN 'approved';
  END IF;

  -- UTC-baserad day-bound (samma semantik som klient + reviewStatus.oracle.ts)
  v_day_start := date_trunc('day', v_workday.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT count(*) INTO v_open_events
  FROM public.assistant_events
  WHERE staff_id = v_workday.staff_id
    AND organization_id = v_workday.organization_id
    AND happened_at >= v_day_start
    AND happened_at < v_day_start + interval '1 day'
    AND resolution_status = 'pending'
    AND stale_for_prompt = false;
  IF v_open_events > 0 THEN
    v_reasons := array_append(v_reasons, 'open_assistant_events');
  END IF;

  SELECT count(*) INTO v_stale_review
  FROM public.assistant_events
  WHERE staff_id = v_workday.staff_id
    AND organization_id = v_workday.organization_id
    AND happened_at >= v_day_start
    AND happened_at < v_day_start + interval '1 day'
    AND still_relevant_for_review = true
    AND resolution_status = 'pending';
  IF v_stale_review > 0 THEN
    v_reasons := array_append(v_reasons, 'stale_review_events');
  END IF;

  IF v_workday.ended_at IS NULL
     AND v_workday.started_at < (now() - interval '20 hours') THEN
    v_reasons := array_append(v_reasons, 'missing_end');
  END IF;

  BEGIN
    SELECT count(*) INTO v_open_travel
    FROM public.travel_time_logs
    WHERE staff_id = v_workday.staff_id
      AND start_time >= v_day_start
      AND start_time < v_day_start + interval '1 day'
      AND end_time IS NULL;
    IF v_open_travel > 0 THEN
      v_reasons := array_append(v_reasons, 'unresolved_travel');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  SELECT count(*) INTO v_missed
  FROM public.assistant_events
  WHERE staff_id = v_workday.staff_id
    AND organization_id = v_workday.organization_id
    AND happened_at >= v_day_start
    AND happened_at < v_day_start + interval '1 day'
    AND stale_for_prompt = true
    AND resolution_status = 'pending';
  IF v_missed >= 3 THEN
    v_reasons := array_append(v_reasons, 'missed_prompts_all_day');
  END IF;

  IF array_length(v_reasons, 1) IS NOT NULL AND array_length(v_reasons, 1) > 0 THEN
    v_status := 'needs_review';
  ELSIF v_workday.ended_at IS NOT NULL THEN
    v_status := 'ready';
  ELSE
    v_status := 'draft';
  END IF;

  UPDATE public.workdays
     SET review_status = v_status,
         review_reasons = v_reasons,
         review_computed_at = now(),
         updated_at = now()
   WHERE id = p_workday_id;

  RETURN v_status;
END $$;

-- 2. Trigger på workdays själv – när ended_at sätts/ändras ska status räknas om
CREATE OR REPLACE FUNCTION public.recompute_workday_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skydda mot rekursion: vi uppdaterar workdays från compute-funktionen.
  -- Bara räkna om när relevanta fält ändrats (eller vid INSERT).
  IF (TG_OP = 'INSERT') OR
     (NEW.ended_at IS DISTINCT FROM OLD.ended_at) OR
     (NEW.started_at IS DISTINCT FROM OLD.started_at) THEN
    PERFORM public.compute_workday_review_status(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_workdays_recompute_self ON public.workdays;
CREATE TRIGGER trg_workdays_recompute_self
AFTER INSERT OR UPDATE OF ended_at, started_at ON public.workdays
FOR EACH ROW EXECUTE FUNCTION public.recompute_workday_self();

-- 3. Trigger på travel_time_logs – när en resa skapas/uppdateras/tas bort
--    ska den dagens workday räknas om så "unresolved_travel" självläker.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='travel_time_logs') THEN
    EXECUTE $TRG$
      CREATE OR REPLACE FUNCTION public.recompute_workday_for_travel()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $f$
      DECLARE
        v_staff text;
        v_when timestamptz;
        v_wd_id uuid;
        v_day_start timestamptz;
      BEGIN
        v_staff := COALESCE(NEW.staff_id, OLD.staff_id);
        v_when := COALESCE(NEW.start_time, OLD.start_time);
        IF v_staff IS NULL OR v_when IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

        v_day_start := date_trunc('day', v_when AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

        SELECT id INTO v_wd_id
        FROM public.workdays
        WHERE staff_id = v_staff
          AND started_at >= v_day_start
          AND started_at < v_day_start + interval '1 day'
        ORDER BY started_at DESC
        LIMIT 1;

        IF v_wd_id IS NOT NULL THEN
          PERFORM public.compute_workday_review_status(v_wd_id);
        END IF;
        RETURN COALESCE(NEW, OLD);
      END $f$;
    $TRG$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_travel_logs_recompute_workday ON public.travel_time_logs';
    EXECUTE 'CREATE TRIGGER trg_travel_logs_recompute_workday
             AFTER INSERT OR UPDATE OR DELETE ON public.travel_time_logs
             FOR EACH ROW EXECUTE FUNCTION public.recompute_workday_for_travel()';
  END IF;
END $$;