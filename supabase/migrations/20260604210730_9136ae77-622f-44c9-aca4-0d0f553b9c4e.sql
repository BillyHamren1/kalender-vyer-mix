ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS assigned_staff_id text NULL REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calendar_scope text NOT NULL DEFAULT 'team_planning';

ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_calendar_scope_check;
ALTER TABLE public.todos
  ADD CONSTRAINT todos_calendar_scope_check
  CHECK (calendar_scope IN ('team_planning','my_calendar'));

CREATE INDEX IF NOT EXISTS idx_todos_org_staff_date
  ON public.todos (organization_id, assigned_staff_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_todos_org_scope_status
  ON public.todos (organization_id, calendar_scope, planning_status);