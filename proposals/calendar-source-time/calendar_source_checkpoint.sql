-- PROPOSAL (not applied). Additive durable source checkpoint per calendar row.
-- source_start_time/source_end_time = canonical explicit Booking time last
-- applied to the row (source_date already is the date checkpoint).
-- No backfill: NULL = legacy/local row → import uses legacy comparison and
-- writes the checkpoint on the first explicit-source pass. No data rewrite.
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS source_end_time timestamptz;

COMMENT ON COLUMN public.calendar_events.source_start_time IS
  'Canonical Booking start time last applied by import (checkpoint). Local edits never change it.';
COMMENT ON COLUMN public.calendar_events.source_end_time IS
  'Canonical Booking end time last applied by import (checkpoint). Local edits never change it.';
