
CREATE TABLE public.large_project_cost_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  large_project_id UUID NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('purchase','handling','assembly','other')),
  description TEXT NOT NULL DEFAULT '',
  supplier TEXT,
  cost_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpcl_project ON public.large_project_cost_lines(large_project_id);
CREATE INDEX idx_lpcl_org ON public.large_project_cost_lines(organization_id);
CREATE INDEX idx_lpcl_category ON public.large_project_cost_lines(large_project_id, category);

ALTER TABLE public.large_project_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view cost lines"
ON public.large_project_cost_lines FOR SELECT
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert cost lines"
ON public.large_project_cost_lines FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update cost lines"
ON public.large_project_cost_lines FOR UPDATE
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete cost lines"
ON public.large_project_cost_lines FOR DELETE
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER update_lpcl_updated_at
BEFORE UPDATE ON public.large_project_cost_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
