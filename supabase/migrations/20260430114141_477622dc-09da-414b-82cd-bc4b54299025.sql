-- Steg 1: Lägg till planning_status på projects och large_projects.
-- Befintliga rader fylls med 'planned' (rörs ej) och nya får 'needs_planning' som default.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'project_planning_status'
  ) THEN
    CREATE TYPE public.project_planning_status AS ENUM ('needs_planning', 'planned');
  END IF;
END$$;

-- projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planning_status public.project_planning_status;

UPDATE public.projects
SET planning_status = 'planned'
WHERE planning_status IS NULL;

ALTER TABLE public.projects
  ALTER COLUMN planning_status SET DEFAULT 'needs_planning',
  ALTER COLUMN planning_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_planning_status
  ON public.projects (planning_status)
  WHERE planning_status = 'needs_planning';

-- large_projects
ALTER TABLE public.large_projects
  ADD COLUMN IF NOT EXISTS planning_status public.project_planning_status;

UPDATE public.large_projects
SET planning_status = 'planned'
WHERE planning_status IS NULL;

ALTER TABLE public.large_projects
  ALTER COLUMN planning_status SET DEFAULT 'needs_planning',
  ALTER COLUMN planning_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_large_projects_planning_status
  ON public.large_projects (planning_status)
  WHERE planning_status = 'needs_planning';