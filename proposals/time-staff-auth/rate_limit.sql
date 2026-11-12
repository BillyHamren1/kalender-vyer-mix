-- NOT APPLIED. Durable fixed-window limiter for time-staff-auth (service_role only).
CREATE TABLE IF NOT EXISTS public.time_staff_auth_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.time_staff_auth_rate_limits TO service_role;
ALTER TABLE public.time_staff_auth_rate_limits ENABLE ROW LEVEL SECURITY; -- no policies: no client access

CREATE OR REPLACE FUNCTION public.time_staff_auth_consume(p_bucket text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int := CASE WHEN p_bucket = 'verify:global' THEN 600
                      WHEN p_bucket LIKE 'verify:id:%' THEN 10
                      ELSE 120 END;            -- resolve:staff:* per staff
  v_window interval := interval '15 minutes';
  v_attempts int;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) > 128 THEN RETURN false; END IF;
  INSERT INTO public.time_staff_auth_rate_limits AS r (bucket, window_start, attempts)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE SET
    attempts = CASE WHEN r.window_start < now() - v_window THEN 1 ELSE r.attempts + 1 END,
    window_start = CASE WHEN r.window_start < now() - v_window THEN now() ELSE r.window_start END
  RETURNING attempts INTO v_attempts;
  RETURN v_attempts <= v_limit;
END $$;
REVOKE ALL ON FUNCTION public.time_staff_auth_consume(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.time_staff_auth_consume(text) TO service_role;
