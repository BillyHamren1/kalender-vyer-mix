-- Create packing_projects table (copy of projects)
CREATE TABLE public.packing_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  project_leader TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_tasks table (copy of project_tasks)
CREATE TABLE public.packing_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES public.staff_members(id),
  deadline DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_info_only BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_task_comments table (copy of task_comments)
CREATE TABLE public.packing_task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.packing_tasks(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES public.staff_members(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_comments table (copy of project_comments)
CREATE TABLE public.packing_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_files table (copy of project_files)
CREATE TABLE public.packing_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_budget table (copy of project_budget)
CREATE TABLE public.packing_budget (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL UNIQUE REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  budgeted_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 350,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_purchases table (copy of project_purchases)
CREATE TABLE public.packing_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  supplier TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  purchase_date DATE,
  receipt_url TEXT,
  category TEXT DEFAULT 'other',
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_quotes table (copy of project_quotes)
CREATE TABLE public.packing_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  description TEXT NOT NULL,
  quoted_amount NUMERIC NOT NULL DEFAULT 0,
  quote_date DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  quote_file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_invoices table (copy of project_invoices)
CREATE TABLE public.packing_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.packing_quotes(id),
  supplier TEXT NOT NULL,
  invoice_number TEXT,
  invoiced_amount NUMERIC NOT NULL DEFAULT 0,
  invoice_date DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid',
  invoice_file_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create packing_labor_costs table (copy of project_labor_costs)
CREATE TABLE public.packing_labor_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packing_id UUID NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES public.staff_members(id),
  staff_name TEXT NOT NULL,
  description TEXT,
  hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  work_date DATE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.packing_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_labor_costs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables (allow all operations)
CREATE POLICY "Allow all operations on packing_projects" ON public.packing_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_tasks" ON public.packing_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_task_comments" ON public.packing_task_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_comments" ON public.packing_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_files" ON public.packing_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_budget" ON public.packing_budget FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_purchases" ON public.packing_purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_quotes" ON public.packing_quotes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_invoices" ON public.packing_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on packing_labor_costs" ON public.packing_labor_costs FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_packing_projects_updated_at BEFORE UPDATE ON public.packing_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packing_tasks_updated_at BEFORE UPDATE ON public.packing_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packing_budget_updated_at BEFORE UPDATE ON public.packing_budget FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packing_quotes_updated_at BEFORE UPDATE ON public.packing_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();