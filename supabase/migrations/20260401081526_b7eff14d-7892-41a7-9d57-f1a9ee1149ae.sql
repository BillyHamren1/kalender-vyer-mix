
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS execution_task_id uuid REFERENCES public.establishment_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.large_project_tasks ADD COLUMN IF NOT EXISTS execution_task_id uuid REFERENCES public.establishment_tasks(id) ON DELETE SET NULL;
