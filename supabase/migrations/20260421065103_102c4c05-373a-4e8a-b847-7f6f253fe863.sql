-- Backfill: close Jānis open warehouse session that was left ticking when
-- a travel log started. Without exited_at the row counted live in parallel
-- with the travel log → double-counted hours.
UPDATE public.location_time_entries
SET exited_at = '2026-04-21 05:15:55.177+00'
WHERE id = 'b347ff5d-c504-419f-b656-d585b1a3726b'
  AND exited_at IS NULL;

-- General catch-up: close ANY open location_time_entries that have a later
-- travel_time_log start for the same staff (same root cause).
UPDATE public.location_time_entries lte
SET exited_at = sub.travel_start
FROM (
  SELECT DISTINCT ON (lte2.id)
    lte2.id,
    ttl.start_time AS travel_start
  FROM public.location_time_entries lte2
  JOIN public.travel_time_logs ttl
    ON ttl.staff_id = lte2.staff_id
   AND ttl.start_time > lte2.entered_at
  WHERE lte2.exited_at IS NULL
  ORDER BY lte2.id, ttl.start_time ASC
) sub
WHERE lte.id = sub.id
  AND lte.exited_at IS NULL;