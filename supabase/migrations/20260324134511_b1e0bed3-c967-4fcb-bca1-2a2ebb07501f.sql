
-- Create project_supplier_links table
-- Stores ONLY project-specific supplier data, references WMS supplier-registry via supplier_id
CREATE TABLE public.project_supplier_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  contact_id UUID,
  service_type TEXT,
  quoted_price NUMERIC,
  confirmed_price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'SEK',
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_date TIMESTAMPTZ,
  notes TEXT,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, supplier_id)
);

-- Enable RLS
ALTER TABLE public.project_supplier_links ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their org supplier links"
  ON public.project_supplier_links FOR SELECT
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert their org supplier links"
  ON public.project_supplier_links FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update their org supplier links"
  ON public.project_supplier_links FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete their org supplier links"
  ON public.project_supplier_links FOR DELETE
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- Trigger for organization_id auto-fill
CREATE TRIGGER set_organization_id_project_supplier_links
  BEFORE INSERT ON public.project_supplier_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_id();

-- Trigger for updated_at
CREATE TRIGGER update_project_supplier_links_updated_at
  BEFORE UPDATE ON public.project_supplier_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
