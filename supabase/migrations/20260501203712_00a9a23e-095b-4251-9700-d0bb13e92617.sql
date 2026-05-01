
CREATE TABLE public.product_groupings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('large_project','booking')),
  scope_id UUID NOT NULL,
  prompt TEXT,
  groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id)
);

CREATE INDEX idx_product_groupings_scope ON public.product_groupings (scope, scope_id);
CREATE INDEX idx_product_groupings_org ON public.product_groupings (organization_id);

ALTER TABLE public.product_groupings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_groupings_org_isolation"
ON public.product_groupings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "product_groupings_select"
ON public.product_groupings FOR SELECT TO authenticated USING (true);

CREATE POLICY "product_groupings_insert"
ON public.product_groupings FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "product_groupings_update"
ON public.product_groupings FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "product_groupings_delete"
ON public.product_groupings FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER update_product_groupings_updated_at
BEFORE UPDATE ON public.product_groupings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
