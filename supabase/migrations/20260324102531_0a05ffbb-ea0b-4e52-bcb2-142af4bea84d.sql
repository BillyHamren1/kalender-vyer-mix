
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS dependency_task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_phase ON public.project_tasks(phase);
CREATE INDEX IF NOT EXISTS idx_project_tasks_dependency ON public.project_tasks(dependency_task_id);
