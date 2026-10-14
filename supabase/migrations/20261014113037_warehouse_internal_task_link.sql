-- Additive warehouse task linkage; preserve legacy events without inferred links.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Linked task reassignment requires explicit unlink/relink. These FKs protect
-- parent mutations even when RLS hides an event from its task/project editor.
ALTER TABLE public.warehouse_calendar_events
  ADD COLUMN IF NOT EXISTS project_task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_internal_project_id uuid,
  ADD COLUMN IF NOT EXISTS linked_internal_project_type boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS warehouse_calendar_events_project_task_idx
  ON public.warehouse_calendar_events(project_task_id) WHERE project_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warehouse_calendar_events_internal_project_idx
  ON public.warehouse_calendar_events(linked_internal_project_id) WHERE linked_internal_project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_internal_projects_identity_idx
  ON public.projects(id, organization_id, is_internal);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_internal_tasks_identity_idx
  ON public.project_tasks(id, organization_id, project_id);

-- Derived relationship fields cannot be supplied independently by a caller.
-- Same-tenant lookup executes as caller under existing RLS, never privileged.
CREATE OR REPLACE FUNCTION public.validate_warehouse_internal_task_link()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.linked_internal_project_type := true;
  IF NEW.project_task_id IS NULL THEN
    NEW.linked_internal_project_id := NULL;
  ELSE
    SELECT p.id INTO NEW.linked_internal_project_id
    FROM public.project_tasks t JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = NEW.project_task_id AND t.organization_id = NEW.organization_id
      AND p.organization_id = NEW.organization_id AND p.is_internal = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Internal task must belong to the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS warehouse_internal_task_link_guard ON public.warehouse_calendar_events;
CREATE TRIGGER warehouse_internal_task_link_guard
  BEFORE INSERT OR UPDATE OF project_task_id, organization_id, linked_internal_project_id, linked_internal_project_type
  ON public.warehouse_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_warehouse_internal_task_link();

-- Only populate relationships already explicitly linked, never infer links.
UPDATE public.warehouse_calendar_events SET project_task_id = project_task_id
WHERE project_task_id IS NOT NULL AND linked_internal_project_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_internal_task_derived_check' AND conrelid = 'public.warehouse_calendar_events'::regclass) THEN
    ALTER TABLE public.warehouse_calendar_events ADD CONSTRAINT warehouse_internal_task_derived_check
      CHECK (linked_internal_project_type = true AND ((project_task_id IS NULL) = (linked_internal_project_id IS NULL)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_internal_task_identity_fk' AND conrelid = 'public.warehouse_calendar_events'::regclass) THEN
    ALTER TABLE public.warehouse_calendar_events ADD CONSTRAINT warehouse_internal_task_identity_fk
      FOREIGN KEY (project_task_id, organization_id, linked_internal_project_id)
      REFERENCES public.project_tasks(id, organization_id, project_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_internal_project_identity_fk' AND conrelid = 'public.warehouse_calendar_events'::regclass) THEN
    ALTER TABLE public.warehouse_calendar_events ADD CONSTRAINT warehouse_internal_project_identity_fk
      FOREIGN KEY (linked_internal_project_id, organization_id, linked_internal_project_type)
      REFERENCES public.projects(id, organization_id, is_internal);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
