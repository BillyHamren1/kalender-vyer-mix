WITH overlap AS (
  SELECT
    lte.id AS lte_id,
    MIN(ttl.start_time) AS cutoff
  FROM public.location_time_entries lte
  JOIN public.travel_time_logs ttl
    ON ttl.staff_id = lte.staff_id
   AND ttl.start_time > lte.entered_at
  WHERE lte.exited_at IS NULL
  GROUP BY lte.id
)
UPDATE public.location_time_entries lte
SET exited_at = overlap.cutoff
FROM overlap
WHERE lte.id = overlap.lte_id
  AND lte.exited_at IS NULL;