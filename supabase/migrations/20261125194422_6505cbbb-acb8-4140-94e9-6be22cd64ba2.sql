ALTER TABLE public.booking_source_state
  ADD COLUMN IF NOT EXISTS calendar_baseline jsonb,
  ADD COLUMN IF NOT EXISTS calendar_baseline_captured_at timestamptz;
COMMENT ON COLUMN public.booking_source_state.calendar_baseline IS
  'Pre-save canonical phase dates/times last reflected in calendar_events; kept until calendar reconcile succeeds so retries after booking-save still see the source change.';

CREATE OR REPLACE FUNCTION public.capture_calendar_baseline(
  p_organization_id uuid, p_booking_id text, p_baseline jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF p_organization_id IS NULL OR nullif(btrim(coalesce(p_booking_id,'')),'') IS NULL
     OR p_baseline IS NULL OR jsonb_typeof(p_baseline) <> 'object' THEN
    RAISE EXCEPTION 'invalid calendar baseline input';
  END IF;
  INSERT INTO public.booking_source_state (organization_id, booking_id, calendar_baseline, calendar_baseline_captured_at)
  VALUES (p_organization_id, p_booking_id, p_baseline, now())
  ON CONFLICT (organization_id, booking_id) DO UPDATE
    SET calendar_baseline = coalesce(booking_source_state.calendar_baseline, EXCLUDED.calendar_baseline),
        calendar_baseline_captured_at = coalesce(booking_source_state.calendar_baseline_captured_at, EXCLUDED.calendar_baseline_captured_at),
        updated_at = now()
  RETURNING calendar_baseline INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.clear_calendar_baseline(
  p_organization_id uuid, p_booking_id text, p_baseline jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.booking_source_state
     SET calendar_baseline = NULL, calendar_baseline_captured_at = NULL, updated_at = now()
   WHERE organization_id = p_organization_id AND booking_id = p_booking_id
     AND calendar_baseline = p_baseline;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

REVOKE ALL ON FUNCTION public.capture_calendar_baseline(uuid, text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_calendar_baseline(uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_calendar_baseline(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_calendar_baseline(uuid, text, jsonb) TO service_role;