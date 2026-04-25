DO $$
DECLARE
  _t record;
  _result uuid;
  _count int := 0;
  _failed int := 0;
BEGIN
  FOR _t IN
    SELECT id FROM public.establishment_tasks
     WHERE calendar_event_id IS NULL
       AND (start_date IS NOT NULL OR due_date IS NOT NULL)
       AND (booking_id IS NOT NULL OR large_project_id IS NOT NULL)
  LOOP
    BEGIN
      _result := public.upsert_task_calendar_event(_t.id);
      IF _result IS NOT NULL THEN
        _count := _count + 1;
      ELSE
        _failed := _failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      RAISE NOTICE 'Failed for task %: %', _t.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Backfill complete: % synced, % failed', _count, _failed;
END $$;