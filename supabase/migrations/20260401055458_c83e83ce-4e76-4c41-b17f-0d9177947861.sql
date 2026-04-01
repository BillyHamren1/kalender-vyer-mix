-- Add unified task execution fields to establishment_tasks
-- Existing tasks default to 'crew' type

ALTER TABLE public.establishment_tasks
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'crew',
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS due_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS start_date_ts timestamptz NULL,
  ADD COLUMN IF NOT EXISTS linked_entity_type text NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS linked_entity_id text NULL;

-- Add constraint for task_type values
ALTER TABLE public.establishment_tasks
  ADD CONSTRAINT chk_task_type CHECK (task_type IN ('crew', 'pm', 'logistics', 'admin'));

-- Add constraint for linked_entity_type values  
ALTER TABLE public.establishment_tasks
  ADD CONSTRAINT chk_linked_entity_type CHECK (linked_entity_type IN ('booking', 'supplier', 'location', 'none'));

-- Index for filtering by task_type
CREATE INDEX IF NOT EXISTS idx_establishment_tasks_task_type ON public.establishment_tasks(task_type);

COMMENT ON COLUMN public.establishment_tasks.task_type IS 'crew=field ops, pm=project management, logistics=transport/warehouse, admin=internal';
COMMENT ON COLUMN public.establishment_tasks.assigned_user_id IS 'System user (profiles) assignment, nullable. Coexists with assigned_to (staff_id)';
COMMENT ON COLUMN public.establishment_tasks.due_date IS 'Hard deadline timestamp for the task';
COMMENT ON COLUMN public.establishment_tasks.start_date_ts IS 'Optional precise start timestamp';
COMMENT ON COLUMN public.establishment_tasks.linked_entity_type IS 'What entity this task links to beyond the booking';
COMMENT ON COLUMN public.establishment_tasks.linked_entity_id IS 'ID of the linked entity (supplier id, location id, etc.)';