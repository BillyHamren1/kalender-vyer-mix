
UPDATE public.workdays
SET ended_at = now(),
    notes = COALESCE(notes, '') || ' [auto-closed: manual cleanup]'
WHERE ended_at IS NULL;

UPDATE public.location_time_entries
SET exited_at = now()
WHERE exited_at IS NULL;
