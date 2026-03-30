-- Add status, readiness, priority, description, blockers, decision_needed to establishment_tasks
ALTER TABLE public.establishment_tasks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS readiness text NOT NULL DEFAULT 'missing_information',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS blockers text,
  ADD COLUMN IF NOT EXISTS blocker_responsible text,
  ADD COLUMN IF NOT EXISTS decision_needed boolean NOT NULL DEFAULT false;

-- Add constraint for valid status values
ALTER TABLE public.establishment_tasks
  ADD CONSTRAINT establishment_tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'blocked', 'done', 'cancelled'));

-- Add constraint for valid readiness values
ALTER TABLE public.establishment_tasks
  ADD CONSTRAINT establishment_tasks_readiness_check
  CHECK (readiness IN ('ready', 'missing_information', 'waiting_for_decision', 'waiting_for_external'));

-- Add constraint for valid priority values
ALTER TABLE public.establishment_tasks
  ADD CONSTRAINT establishment_tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high'));