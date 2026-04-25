DELETE FROM public.calendar_events
WHERE booking_id = 'a970e0e5-098c-4208-a984-7cdbde508748'
  AND (
    (event_type = 'rig'     AND source_date NOT IN ('2026-07-20'::date)) OR
    (event_type = 'rigDown' AND source_date NOT IN ('2026-07-27'::date))
  );