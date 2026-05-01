DO $$
DECLARE
  _task_id uuid := 'b0b98837-f317-4a00-9a83-34d70361c1d6';
  _cal_id uuid;
BEGIN
  SELECT calendar_event_id INTO _cal_id FROM public.establishment_tasks WHERE id = _task_id;

  -- Detach the calendar reference first to avoid the cyclic BEFORE-DELETE trigger
  UPDATE public.establishment_tasks SET calendar_event_id = NULL WHERE id = _task_id;

  -- Remove the linked activity calendar event (protected by trigger)
  IF _cal_id IS NOT NULL THEN
    PERFORM set_config('app.allow_activity_delete', 'true', true);
    DELETE FROM public.calendar_events WHERE id = _cal_id;
    PERFORM set_config('app.allow_activity_delete', 'false', true);
  END IF;

  -- Now delete the task
  DELETE FROM public.establishment_tasks WHERE id = _task_id;
END $$;