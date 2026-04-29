ALTER TABLE public.large_project_cost_lines
  ADD COLUMN IF NOT EXISTS budget_amount numeric NOT NULL DEFAULT 0;