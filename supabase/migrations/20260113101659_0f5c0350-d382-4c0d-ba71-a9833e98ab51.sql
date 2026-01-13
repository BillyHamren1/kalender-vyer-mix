-- Create project_budget table for staff time budgets
CREATE TABLE public.project_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budgeted_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 350,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Create project_purchases table for tracking purchases
CREATE TABLE public.project_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  supplier TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  purchase_date DATE,
  receipt_url TEXT,
  category TEXT DEFAULT 'other',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create project_quotes table for rental material quotes
CREATE TABLE public.project_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  description TEXT NOT NULL,
  quoted_amount NUMERIC NOT NULL DEFAULT 0,
  quote_date DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  quote_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create project_invoices table for invoices linked to quotes
CREATE TABLE public.project_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.project_quotes(id) ON DELETE SET NULL,
  supplier TEXT NOT NULL,
  invoice_number TEXT,
  invoiced_amount NUMERIC NOT NULL DEFAULT 0,
  invoice_date DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid',
  invoice_file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.project_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for project_budget
CREATE POLICY "Allow all operations on project_budget"
ON public.project_budget
FOR ALL
USING (true)
WITH CHECK (true);

-- Create RLS policies for project_purchases
CREATE POLICY "Allow all operations on project_purchases"
ON public.project_purchases
FOR ALL
USING (true)
WITH CHECK (true);

-- Create RLS policies for project_quotes
CREATE POLICY "Allow all operations on project_quotes"
ON public.project_quotes
FOR ALL
USING (true)
WITH CHECK (true);

-- Create RLS policies for project_invoices
CREATE POLICY "Allow all operations on project_invoices"
ON public.project_invoices
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for project_budget updated_at
CREATE TRIGGER update_project_budget_updated_at
BEFORE UPDATE ON public.project_budget
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for project_quotes updated_at
CREATE TRIGGER update_project_quotes_updated_at
BEFORE UPDATE ON public.project_quotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();