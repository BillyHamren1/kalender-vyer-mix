-- Stäng dubbletterna: behåll äldsta öppna entry per (staff, location), stäng övriga
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY staff_id, location_id ORDER BY entered_at ASC) AS rn
  FROM public.location_time_entries
  WHERE exited_at IS NULL
)
UPDATE public.location_time_entries lte
SET exited_at = NOW()
FROM ranked
WHERE lte.id = ranked.id AND ranked.rn > 1;

-- Förhindra framtida race conditions: bara EN öppen entry per (staff, location)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_location_entry_per_staff
  ON public.location_time_entries (staff_id, location_id)
  WHERE exited_at IS NULL;