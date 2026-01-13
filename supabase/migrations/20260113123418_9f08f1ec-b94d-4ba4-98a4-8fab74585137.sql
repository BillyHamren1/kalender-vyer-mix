-- Create table for manual labor costs
CREATE TABLE public.project_labor_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,
  description TEXT,
  hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  work_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Enable RLS
ALTER TABLE public.project_labor_costs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations on project_labor_costs" 
ON public.project_labor_costs 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_project_labor_costs_project_id ON public.project_labor_costs(project_id);