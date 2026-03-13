
-- Billing status enum
CREATE TYPE public.billing_status AS ENUM (
  'not_ready',
  'under_review',
  'ready_to_invoice',
  'invoice_created',
  'invoiced',
  'partially_paid',
  'paid',
  'overdue'
);

-- Project billing table - separate from project operational status
CREATE TABLE public.project_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to any project type
  project_id TEXT NOT NULL,
  project_type TEXT NOT NULL CHECK (project_type IN ('small', 'medium', 'large')),
  
  -- Core billing status
  billing_status billing_status NOT NULL DEFAULT 'not_ready',
  
  -- Project snapshot info
  project_name TEXT NOT NULL,
  client_name TEXT,
  booking_id TEXT,
  project_leader TEXT,
  
  -- Dates
  closed_at TIMESTAMPTZ,
  event_date DATE,
  delivery_date DATE,
  
  -- Financial summary
  quoted_amount NUMERIC DEFAULT 0,
  invoiceable_amount NUMERIC DEFAULT 0,
  invoiced_amount NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  
  -- Invoice details
  invoice_number TEXT,
  external_invoice_id TEXT,
  invoice_reference TEXT,
  invoice_date DATE,
  due_date DATE,
  invoice_sent_at TIMESTAMPTZ,
  invoice_paid_at TIMESTAMPTZ,
  
  -- Review workflow
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_review', 'needs_completion', 'approved')),
  review_completed_at TIMESTAMPTZ,
  approved_for_invoicing_at TIMESTAMPTZ,
  approved_by TEXT,
  
  -- Review checklist (stored as JSONB)
  review_checklist JSONB DEFAULT '{}'::jsonb,
  
  -- Notes
  internal_notes TEXT,
  
  -- Multi-tenant
  organization_id UUID NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique: one billing record per project
  UNIQUE (project_id, project_type, organization_id)
);

-- RLS
ALTER TABLE public.project_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_project_billing"
  ON public.project_billing
  FOR ALL
  TO public
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_project_billing_updated_at
  BEFORE UPDATE ON public.project_billing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_project_billing_status ON public.project_billing(billing_status, organization_id);
CREATE INDEX idx_project_billing_project ON public.project_billing(project_id, project_type);
