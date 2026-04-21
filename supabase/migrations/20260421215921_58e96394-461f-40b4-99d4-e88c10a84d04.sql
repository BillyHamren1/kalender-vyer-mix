UPDATE location_time_entries
SET exited_at = '2026-04-21 14:15:00+00'
WHERE exited_at IS NULL
  AND entered_at < '2026-04-21 14:15:00+00';