CREATE TABLE public.planning_brain_read_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL,
  organization_id uuid NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX planning_brain_read_nonces_nonce_key
  ON public.planning_brain_read_nonces (nonce);
CREATE INDEX planning_brain_read_nonces_expires_at_idx
  ON public.planning_brain_read_nonces (expires_at);

-- Security-only infrastructure: no anon/authenticated access at all.
REVOKE ALL ON public.planning_brain_read_nonces FROM PUBLIC;
GRANT ALL ON public.planning_brain_read_nonces TO service_role;

ALTER TABLE public.planning_brain_read_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_planning_brain_nonces"
  ON public.planning_brain_read_nonces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_planning_brain_read_nonce(
  _nonce text,
  _organization_id uuid,
  _ttl_seconds integer DEFAULT 600
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF _nonce IS NULL OR length(_nonce) < 16 OR length(_nonce) > 128 OR _organization_id IS NULL THEN
    RETURN false;
  END IF;

  -- Bounded cleanup of expired security rows (never business data).
  DELETE FROM public.planning_brain_read_nonces
  WHERE id IN (
    SELECT id FROM public.planning_brain_read_nonces
    WHERE expires_at < now()
    LIMIT 500
  );

  INSERT INTO public.planning_brain_read_nonces (nonce, organization_id, expires_at)
  VALUES (_nonce, _organization_id, now() + make_interval(secs => GREATEST(60, LEAST(3600, COALESCE(_ttl_seconds, 600)))))
  ON CONFLICT (nonce) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_planning_brain_read_nonce(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_planning_brain_read_nonce(text, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_planning_brain_read_nonce(text, uuid, integer) TO service_role;