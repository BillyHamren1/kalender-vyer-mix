-- Expand project completion analytics with structured fields + child tables

-- 1. Add structured columns to job_completion_analytics (project-level)
ALTER TABLE public.job_completion_analytics
  ADD COLUMN IF NOT EXISTS customer_type TEXT,
  ADD COLUMN IF NOT EXISTS project_type TEXT,
  ADD COLUMN IF NOT EXISTS geographic_area TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS total_approved_hours NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_parcels INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_type TEXT,
  ADD COLUMN IF NOT EXISTS is_indoor BOOLEAN,
  ADD COLUMN IF NOT EXISTS complexity_score INTEGER,
  ADD COLUMN IF NOT EXISTS had_late_changes BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS had_deviations BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deviation_types TEXT[] DEFAULT '{}';

-- 2. Per-product analytics
CREATE TABLE IF NOT EXISTS public.completion_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES public.job_completion_analytics(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  booking_product_id UUID,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  sku TEXT,
  unit_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  setup_hours NUMERIC DEFAULT 0,
  material_cost NUMERIC DEFAULT 0,
  external_cost NUMERIC DEFAULT 0,
  is_package BOOLEAN DEFAULT false,
  parent_package_name TEXT,
  added_late BOOLEAN DEFAULT false,
  caused_deviation BOOLEAN DEFAULT false,
  deviation_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.completion_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_filter_completion_products ON public.completion_products
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 3. Per-staff analytics
CREATE TABLE IF NOT EXISTS public.completion_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES public.job_completion_analytics(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  role TEXT,
  work_date DATE NOT NULL,
  hours_worked NUMERIC NOT NULL DEFAULT 0,
  overtime_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC DEFAULT 0,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.completion_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_filter_completion_staff ON public.completion_staff
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- 4. Per-deviation analytics
CREATE TABLE IF NOT EXISTS public.completion_deviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES public.job_completion_analytics(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  deviation_type TEXT NOT NULL,
  description TEXT,
  impact_type TEXT,
  impact_hours NUMERIC DEFAULT 0,
  impact_cost NUMERIC DEFAULT 0,
  related_product_id UUID,
  related_staff_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.completion_deviations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_filter_completion_deviations ON public.completion_deviations
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_completion_products_completion ON public.completion_products(completion_id);
CREATE INDEX IF NOT EXISTS idx_completion_products_category ON public.completion_products(category);
CREATE INDEX IF NOT EXISTS idx_completion_staff_completion ON public.completion_staff(completion_id);
CREATE INDEX IF NOT EXISTS idx_completion_staff_staff_id ON public.completion_staff(staff_id);
CREATE INDEX IF NOT EXISTS idx_completion_deviations_completion ON public.completion_deviations(completion_id);
CREATE INDEX IF NOT EXISTS idx_completion_deviations_type ON public.completion_deviations(deviation_type);
CREATE INDEX IF NOT EXISTS idx_jca_customer_type ON public.job_completion_analytics(customer_type);
CREATE INDEX IF NOT EXISTS idx_jca_project_type ON public.job_completion_analytics(project_type);
CREATE INDEX IF NOT EXISTS idx_jca_geographic_area ON public.job_completion_analytics(geographic_area);