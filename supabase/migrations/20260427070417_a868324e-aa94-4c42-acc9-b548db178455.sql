-- Skift calendar_events: tolka lagrad UTC-klocka som om den redan var lokal Stockholm
UPDATE public.calendar_events
SET 
  start_time = ((start_time AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm'),
  end_time   = ((end_time   AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm');

-- Skift bookings tidsfält
UPDATE public.bookings
SET 
  rig_start_time     = CASE WHEN rig_start_time     IS NULL THEN NULL ELSE ((rig_start_time     AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END,
  rig_end_time       = CASE WHEN rig_end_time       IS NULL THEN NULL ELSE ((rig_end_time       AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END,
  event_start_time   = CASE WHEN event_start_time   IS NULL THEN NULL ELSE ((event_start_time   AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END,
  event_end_time     = CASE WHEN event_end_time     IS NULL THEN NULL ELSE ((event_end_time     AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END,
  rigdown_start_time = CASE WHEN rigdown_start_time IS NULL THEN NULL ELSE ((rigdown_start_time AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END,
  rigdown_end_time   = CASE WHEN rigdown_end_time   IS NULL THEN NULL ELSE ((rigdown_end_time   AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'Europe/Stockholm') END;