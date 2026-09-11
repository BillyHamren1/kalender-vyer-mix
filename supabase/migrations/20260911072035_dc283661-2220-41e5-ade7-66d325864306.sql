CREATE TABLE IF NOT EXISTS public.client_diagnostics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid,
  user_id uuid,
  code text NOT NULL,
  source text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  route text,
  platform text,
  app_mode text,
  fingerprint text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_diagnostics TO authenticated;
GRANT ALL ON public.client_diagnostics TO service_role;

ALTER TABLE public.client_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read org diagnostics" ON public.client_diagnostics;
CREATE POLICY "Admins read org diagnostics"
ON public.client_diagnostics
FOR SELECT
TO authenticated
USING (
  public.has_role('admin'::app_role, auth.uid())
  AND organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS client_diagnostics_org_created_idx
  ON public.client_diagnostics (organization_id, created_at DESC);