UPDATE public.workdays
SET ended_at = (date_trunc('day', (started_at AT TIME ZONE 'Europe/Stockholm') + interval '1 day') + interval '1 minute') AT TIME ZONE 'Europe/Stockholm',
    notes = COALESCE(notes, '') || ' [auto-closed: stale workday from previous day]'
WHERE ended_at IS NULL
  AND (started_at AT TIME ZONE 'Europe/Stockholm')::date < (now() AT TIME ZONE 'Europe/Stockholm')::date;