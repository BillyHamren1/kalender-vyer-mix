ALTER TABLE public.establishment_tasks
  ADD COLUMN IF NOT EXISTS visible_in_time_app boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_in_project_calendar boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_establishment_tasks_visible_time_app
  ON public.establishment_tasks (visible_in_time_app)
  WHERE visible_in_time_app = true;