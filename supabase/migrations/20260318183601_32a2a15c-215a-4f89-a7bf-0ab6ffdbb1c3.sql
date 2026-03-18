
CREATE TABLE public.economy_cache (
  booking_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid())
);

ALTER TABLE public.economy_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_economy_cache" ON public.economy_cache
  FOR ALL
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Service role needs full access for edge function writes
CREATE POLICY "service_role_economy_cache" ON public.economy_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
