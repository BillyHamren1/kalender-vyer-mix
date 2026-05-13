ALTER TABLE public.time_reports
  ADD COLUMN IF NOT EXISTS day_timeline_block_key text;

COMMENT ON COLUMN public.time_reports.day_timeline_block_key IS
  'Stable key from interpretDayTimeline (staff|date|index|...). Used for idempotent end-of-day commit. NULL for legacy/manual rows.';

CREATE UNIQUE INDEX IF NOT EXISTS time_reports_day_timeline_block_key_uidx
  ON public.time_reports (staff_id, day_timeline_block_key)
  WHERE day_timeline_block_key IS NOT NULL;