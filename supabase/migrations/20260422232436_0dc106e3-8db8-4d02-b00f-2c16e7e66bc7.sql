
-- 1. Enum för dagstatus
DO $$ BEGIN
  CREATE TYPE public.workday_review_status AS ENUM ('draft', 'needs_review', 'ready', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Kolumner på workdays
ALTER TABLE public.workdays
  ADD COLUMN IF NOT EXISTS review_status public.workday_review_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS review_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_computed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workdays_review_status
  ON public.workdays (organization_id, staff_id, review_status);

-- 3. Beräkningsfunktion. Skäl-koder:
--    open_assistant_events    : minst ett event med resolution_status='pending' och stale_for_prompt=false
--    stale_review_events      : event med still_relevant_for_review=true men inget öppet
--    missing_end              : workday saknar ended_at och dagen är >= idag-1
--    unresolved_travel        : öppna travel_time_logs (started_at not null, ended_at null) som hör till dagen
--    missed_prompts_all_day   : >= 3 events idag är stale_for_prompt=true utan resolution
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
  v_day_end timestamptz;
  v_status public.workday_review_status;
BEGIN
  SELECT * INTO v_workday FROM public.workdays WHERE id = p_workday_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Approved låses
  IF v_workday.review_status = 'approved' THEN
    RETURN 'approved';
  END IF;

  v_day_start := date_trunc('day', v_workday.started_at);
  v_day_end := COALESCE(v_workday.ended_at, v_day_start + interval '1 day');

  -- Öppna events i prompt-kön
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

  -- Events som är staleade men kvar i review-underlaget
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

  -- Saknat dagslut: dagen är >=igår och ended_at saknas
  IF v_workday.ended_at IS NULL
     AND v_workday.started_at < (now() - interval '20 hours') THEN
    v_reasons := array_append(v_reasons, 'missing_end');
  END IF;

  -- Oklara resor under dagen
  BEGIN
    SELECT count(*) INTO v_open_travel
    FROM public.travel_time_logs
    WHERE staff_id = v_workday.staff_id
      AND started_at >= v_day_start
      AND started_at < v_day_start + interval '1 day'
      AND ended_at IS NULL;
    IF v_open_travel > 0 THEN
      v_reasons := array_append(v_reasons, 'unresolved_travel');
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- travel-tabellen finns inte i alla miljöer; ignorera
    NULL;
  END;

  -- Missade prompts hela dagen (>= 3 stale utan resolution)
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

  -- Status: needs_review om något skäl, ready om dagen är slut, annars draft
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

-- 4. Trigger: räkna om dagens status när ett assistant_event ändras
CREATE OR REPLACE FUNCTION public.recompute_workday_for_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff text;
  v_org uuid;
  v_when timestamptz;
  v_wd_id uuid;
BEGIN
  v_staff := COALESCE(NEW.staff_id, OLD.staff_id);
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  v_when := COALESCE(NEW.happened_at, OLD.happened_at);

  SELECT id INTO v_wd_id
  FROM public.workdays
  WHERE staff_id = v_staff
    AND organization_id = v_org
    AND started_at >= date_trunc('day', v_when)
    AND started_at < date_trunc('day', v_when) + interval '1 day'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_wd_id IS NOT NULL THEN
    PERFORM public.compute_workday_review_status(v_wd_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assistant_events_recompute_workday ON public.assistant_events;
CREATE TRIGGER trg_assistant_events_recompute_workday
AFTER INSERT OR UPDATE ON public.assistant_events
FOR EACH ROW EXECUTE FUNCTION public.recompute_workday_for_event();
