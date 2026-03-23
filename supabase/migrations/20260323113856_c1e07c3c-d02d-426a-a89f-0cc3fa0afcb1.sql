-- Clean up orphaned calendar events for the deleted project
DELETE FROM public.calendar_events WHERE booking_id = 'project-f7de4297-dd07-4e43-9fc9-fabce32ace21';

-- Create a trigger to auto-remove calendar events when a standalone project is deleted
CREATE OR REPLACE FUNCTION public.handle_project_delete_calendar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.calendar_events WHERE booking_id = 'project-' || OLD.id::text;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_project_delete_calendar
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_project_delete_calendar();