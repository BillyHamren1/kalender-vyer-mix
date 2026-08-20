CREATE OR REPLACE FUNCTION public.create_default_project_todo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_tasks pt
    WHERE pt.project_id = NEW.id
      AND pt.title = 'Boka transport'
      AND pt.completed = false
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.project_tasks (project_id, title, sort_order, completed, organization_id)
  VALUES (NEW.id, 'Boka transport', 0, false, NEW.organization_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_project_todo ON public.projects;

CREATE TRIGGER trg_create_default_project_todo
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.create_default_project_todo();