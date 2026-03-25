
CREATE TABLE public.packing_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by text,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.packing_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_packing_sync_log" ON public.packing_sync_log
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "service_role_packing_sync_log" ON public.packing_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_packing_sync_log_packing_id ON public.packing_sync_log(packing_id);
CREATE INDEX idx_packing_sync_log_created_at ON public.packing_sync_log(created_at DESC);
