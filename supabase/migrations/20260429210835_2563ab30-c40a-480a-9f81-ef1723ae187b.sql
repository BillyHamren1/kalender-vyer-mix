CREATE TABLE IF NOT EXISTS public.timeline_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  report_date date NOT NULL,
  suggestion_id uuid,
  time_report_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_action_audit_org_staff_date
  ON public.timeline_action_audit (organization_id, staff_id, report_date);
CREATE INDEX IF NOT EXISTS idx_timeline_action_audit_suggestion
  ON public.timeline_action_audit (suggestion_id);

ALTER TABLE public.timeline_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit readable by org members" ON public.timeline_action_audit;
CREATE POLICY "audit readable by org members"
  ON public.timeline_action_audit
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "audit insert by org admins" ON public.timeline_action_audit;
CREATE POLICY "audit insert by org admins"
  ON public.timeline_action_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND (
      public.has_role('admin'::app_role, auth.uid())
      OR public.has_role('projekt'::app_role, auth.uid())
      OR public.has_role('lager'::app_role, auth.uid())
    )
  );