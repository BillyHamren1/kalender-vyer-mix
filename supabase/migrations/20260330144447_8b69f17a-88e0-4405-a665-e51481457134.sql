
CREATE OR REPLACE FUNCTION public.bump_project_on_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking_id uuid;
  _large_project_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _booking_id := OLD.booking_id;
    _large_project_id := OLD.large_project_id;
  ELSE
    _booking_id := NEW.booking_id;
    _large_project_id := NEW.large_project_id;
  END IF;

  IF _large_project_id IS NOT NULL THEN
    UPDATE large_projects SET updated_at = now() WHERE id = _large_project_id;
  END IF;

  IF _booking_id IS NOT NULL THEN
    UPDATE projects SET updated_at = now() WHERE booking_id = _booking_id;
    UPDATE jobs SET updated_at = now() WHERE booking_id = _booking_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_bump_project_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON establishment_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_project_on_task_change();
