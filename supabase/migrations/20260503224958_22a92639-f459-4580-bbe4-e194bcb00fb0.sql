
-- Suppliers cache table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  external_id UUID,
  name TEXT NOT NULL,
  short_name TEXT,
  color TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  notes TEXT,
  primary_contact JSONB,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE INDEX idx_suppliers_org ON public.suppliers(organization_id);
CREATE INDEX idx_suppliers_name ON public.suppliers(organization_id, lower(name));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view suppliers"
ON public.suppliers FOR SELECT
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Planning users can insert suppliers"
ON public.suppliers FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);

CREATE POLICY "Planning users can update suppliers"
ON public.suppliers FOR UPDATE
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);

CREATE POLICY "Admins can delete suppliers"
ON public.suppliers FOR DELETE
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_role('admin', auth.uid())
);

CREATE TRIGGER suppliers_set_org
BEFORE INSERT ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
