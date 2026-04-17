-- 1. Add is_internal to warehouse_projects
ALTER TABLE public.warehouse_projects
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_projects_one_internal_per_org
  ON public.warehouse_projects (organization_id)
  WHERE is_internal = true;

-- 2. Add category to warehouse_project_tasks (text, validated via trigger for flexibility)
ALTER TABLE public.warehouse_project_tasks
  ADD COLUMN IF NOT EXISTS category text;

-- Make start_date / end_date nullable for internal tasks (if not already)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_project_tasks'
      AND column_name='start_date' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.warehouse_project_tasks ALTER COLUMN start_date DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_project_tasks'
      AND column_name='end_date' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.warehouse_project_tasks ALTER COLUMN end_date DROP NOT NULL;
  END IF;
END $$;

-- 3. Function: ensure internal Lager project for an organization
CREATE OR REPLACE FUNCTION public.ensure_internal_warehouse_project(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id
  FROM public.warehouse_projects
  WHERE organization_id = _org_id AND is_internal = true
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  INSERT INTO public.warehouse_projects (
    organization_id, project_number, name, status, is_internal,
    start_date, end_date, notes
  ) VALUES (
    _org_id, 'LAGER', 'Lager', 'in_progress', true,
    NULL, NULL, 'Internt projekt för löpande lagerarbete (städa, tvätta, planera, inköp m.m.)'
  )
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$$;

-- 4. Backfill: create Lager project for all existing organizations
DO $$
DECLARE
  _org RECORD;
BEGIN
  FOR _org IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_internal_warehouse_project(_org.id);
  END LOOP;
END $$;

-- 5. Trigger: auto-create Lager project for new organizations
CREATE OR REPLACE FUNCTION public.create_internal_warehouse_project_for_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_internal_warehouse_project(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_internal_warehouse_project ON public.organizations;
CREATE TRIGGER trg_create_internal_warehouse_project
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.create_internal_warehouse_project_for_new_org();

-- 6. Protect internal warehouse projects from deletion
CREATE OR REPLACE FUNCTION public.prevent_internal_warehouse_project_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_internal = true THEN
    RAISE EXCEPTION 'Internt lagerprojekt (Lager) kan inte raderas';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_internal_warehouse_project_delete ON public.warehouse_projects;
CREATE TRIGGER trg_prevent_internal_warehouse_project_delete
BEFORE DELETE ON public.warehouse_projects
FOR EACH ROW
EXECUTE FUNCTION public.prevent_internal_warehouse_project_delete();