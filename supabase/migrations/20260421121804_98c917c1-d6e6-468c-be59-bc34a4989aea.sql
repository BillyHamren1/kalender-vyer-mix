UPDATE public.travel_time_logs
SET end_time = '2026-04-21 06:22:00+00'::timestamptz,
    hours_worked = EXTRACT(EPOCH FROM ('2026-04-21 06:22:00+00'::timestamptz - start_time)) / 3600.0
WHERE id = '1b680bf3-2aea-4753-a70f-2d0765cdff32';

UPDATE public.location_time_entries
SET entered_at = '2026-04-21 06:22:00+00'::timestamptz
WHERE id = '97fe14f4-70ae-4a77-9edd-f3789895e59c';