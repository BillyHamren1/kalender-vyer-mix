-- 1. project_tasks: lägg till assigned_to_ids (multi-staff), task_id på time_entries
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS assigned_to_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. location_time_entries: koppla tid till en specifik task (valfritt)
ALTER TABLE public.location_time_entries
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL;

-- 3. Index för snabb filtrering på "mina uppgifter"
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to_ids
  ON public.project_tasks USING GIN (assigned_to_ids);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_completed
  ON public.project_tasks (project_id, completed);

CREATE INDEX IF NOT EXISTS idx_location_time_entries_task_id
  ON public.location_time_entries (task_id) WHERE task_id IS NOT NULL;

-- 4. RLS-policies för project_tasks så mobil-personal kan läsa/skapa egna lageruppgifter
-- (befintliga policies förmodligen begränsar till admin/projektledare)

-- Säkerställ RLS aktiverad
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: alla i org får SELECT på interna projektets tasks (Lager)
DROP POLICY IF EXISTS "Org members can view internal project tasks" ON public.project_tasks;
CREATE POLICY "Org members can view internal project tasks"
ON public.project_tasks
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_tasks.project_id AND p.is_internal = true
  )
);

-- Policy: org-medlemmar kan skapa tasks i interna projektet
DROP POLICY IF EXISTS "Org members can insert internal project tasks" ON public.project_tasks;
CREATE POLICY "Org members can insert internal project tasks"
ON public.project_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_tasks.project_id AND p.is_internal = true
  )
);

-- Policy: org-medlemmar kan uppdatera tasks i interna projektet (toggla completed, ändra assigned)
DROP POLICY IF EXISTS "Org members can update internal project tasks" ON public.project_tasks;
CREATE POLICY "Org members can update internal project tasks"
ON public.project_tasks
FOR UPDATE
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_tasks.project_id AND p.is_internal = true
  )
);

-- Policy: bara admin/projektledare kan radera
DROP POLICY IF EXISTS "Admins can delete internal project tasks" ON public.project_tasks;
CREATE POLICY "Admins can delete internal project tasks"
ON public.project_tasks
FOR DELETE
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);
