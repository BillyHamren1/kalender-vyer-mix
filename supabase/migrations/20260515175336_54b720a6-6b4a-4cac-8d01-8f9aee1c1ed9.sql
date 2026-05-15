
-- Suppliers from external registry (mirrored locally)
CREATE TABLE public.external_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  organization_number TEXT,
  name TEXT NOT NULL,
  vat_number TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  external_created_at TIMESTAMPTZ,
  external_updated_at TIMESTAMPTZ,
  raw JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX idx_external_suppliers_org ON public.external_suppliers(organization_id);
CREATE INDEX idx_external_suppliers_updated ON public.external_suppliers(organization_id, external_updated_at DESC);

CREATE TABLE public.external_supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.external_suppliers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  supplier_external_id TEXT NOT NULL,
  name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  raw JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX idx_external_supplier_contacts_supplier ON public.external_supplier_contacts(supplier_id);
CREATE INDEX idx_external_supplier_contacts_org ON public.external_supplier_contacts(organization_id);

CREATE TABLE public.external_supplier_sync_state (
  organization_id UUID PRIMARY KEY,
  last_updated_at_seen TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  last_run_stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_external_suppliers_updated
BEFORE UPDATE ON public.external_suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_external_supplier_contacts_updated
BEFORE UPDATE ON public.external_supplier_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_external_supplier_sync_state_updated
BEFORE UPDATE ON public.external_supplier_sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.external_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_supplier_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read external_suppliers"
ON public.external_suppliers FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "org members read external_supplier_contacts"
ON public.external_supplier_contacts FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "org members read external_supplier_sync_state"
ON public.external_supplier_sync_state FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));
-- (writes only via service role / edge functions; no insert/update/delete policies)
