
CREATE TABLE public.project_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  contact_person text,
  email text,
  phone text,
  service_type text,
  quoted_price numeric,
  confirmed_price numeric,
  currency text DEFAULT 'SEK',
  status text NOT NULL DEFAULT 'draft',
  delivery_date timestamptz,
  notes text,
  organization_id uuid NOT NULL DEFAULT (public.get_user_organization_id(auth.uid())),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

CREATE INDEX idx_project_suppliers_project_id ON public.project_suppliers(project_id);
CREATE INDEX idx_project_suppliers_organization_id ON public.project_suppliers(organization_id);

CREATE TRIGGER update_project_suppliers_updated_at
  BEFORE UPDATE ON public.project_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_project_suppliers_organization_id
  BEFORE INSERT ON public.project_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

ALTER TABLE public.project_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers in their org"
  ON public.project_suppliers FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert suppliers in their org"
  ON public.project_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update suppliers in their org"
  ON public.project_suppliers FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete suppliers in their org"
  ON public.project_suppliers FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
