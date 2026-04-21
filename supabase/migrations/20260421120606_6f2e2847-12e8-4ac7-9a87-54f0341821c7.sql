UPDATE public.location_time_entries
SET exited_at = '2026-04-21 08:16:31.832+00'::timestamptz
WHERE id = '97fe14f4-70ae-4a77-9edd-f3789895e59c'
  AND exited_at IS NULL;