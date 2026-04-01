
CREATE TABLE public.product_cost_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  booking_id TEXT,
  assembly_cost NUMERIC DEFAULT NULL,
  handling_cost NUMERIC DEFAULT NULL,
  purchase_cost NUMERIC DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  organization_id UUID REFERENCES public.organizations(id),
  UNIQUE(project_id, product_id)
);

ALTER TABLE public.product_cost_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on product_cost_overrides"
  ON public.product_cost_overrides
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_org_id_product_cost_overrides
  BEFORE INSERT ON public.product_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER update_updated_at_product_cost_overrides
  BEFORE UPDATE ON public.product_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
