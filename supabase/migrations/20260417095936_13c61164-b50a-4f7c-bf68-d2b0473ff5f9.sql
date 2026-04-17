-- 1. Drop triggers that create / protect internal warehouse_projects
DROP TRIGGER IF EXISTS trg_create_internal_warehouse_project ON public.organizations;
DROP TRIGGER IF EXISTS trg_prevent_internal_warehouse_project_delete ON public.warehouse_projects;

-- 2. Delete the existing internal warehouse_projects (and any tasks)
DELETE FROM public.warehouse_project_tasks
WHERE warehouse_project_id IN (
  SELECT id FROM public.warehouse_projects WHERE is_internal = true
);

DELETE FROM public.warehouse_projects WHERE is_internal = true;

-- 3. Add category column on project_tasks if missing
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 4. Helper to ensure an internal project exists per organization
CREATE OR REPLACE FUNCTION public.ensure_internal_project(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id
  FROM public.projects
  WHERE organization_id = _org_id AND is_internal = true
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  INSERT INTO public.projects (
    organization_id, name, status, is_internal
  ) VALUES (
    _org_id, 'Lager', 'in_progress', true
  )
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$$;

-- 5. Trigger: create internal Lager project for every new organization
CREATE OR REPLACE FUNCTION public.create_internal_project_for_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_internal_project(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_internal_project_for_new_org ON public.organizations;
CREATE TRIGGER trg_create_internal_project_for_new_org
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_internal_project_for_new_org();

-- 6. Backfill: ensure every existing organization has an internal Lager project
DO $$
DECLARE
  _org RECORD;
BEGIN
  FOR _org IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_internal_project(_org.id);
  END LOOP;
END $$;

-- 7. Protect internal projects from accidental deletion
CREATE OR REPLACE FUNCTION public.prevent_internal_project_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_internal = true THEN
    RAISE EXCEPTION 'Internt projekt (Lager) kan inte raderas';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_internal_project_delete ON public.projects;
CREATE TRIGGER trg_prevent_internal_project_delete
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_internal_project_delete();