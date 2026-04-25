UPDATE public.calendar_events
SET title = regexp_replace(title, '^\[[^\]]+\]\s+', '')
WHERE event_type = 'activity'
  AND title ~ '^\[[^\]]+\]\s';