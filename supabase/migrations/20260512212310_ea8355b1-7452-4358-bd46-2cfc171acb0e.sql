
CREATE TABLE public.large_project_view_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  large_project_id UUID NOT NULL UNIQUE,
  column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpvc_org ON public.large_project_view_config (organization_id);

ALTER TABLE public.large_project_view_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpvc_org_isolation"
ON public.large_project_view_config
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpvc_select" ON public.large_project_view_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "lpvc_insert" ON public.large_project_view_config FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "lpvc_update" ON public.large_project_view_config FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "lpvc_delete" ON public.large_project_view_config FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER update_lpvc_updated_at
BEFORE UPDATE ON public.large_project_view_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
