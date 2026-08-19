DROP TRIGGER IF EXISTS trg_sync_task_to_calendar_del ON public.establishment_tasks;
CREATE TRIGGER trg_sync_task_to_calendar_del
AFTER DELETE ON public.establishment_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_to_calendar();