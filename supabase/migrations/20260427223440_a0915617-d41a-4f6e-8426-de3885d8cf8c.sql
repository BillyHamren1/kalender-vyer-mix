-- Add gap-derivation metadata to travel_time_logs
ALTER TABLE public.travel_time_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gps',
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_target_type text,
  ADD COLUMN IF NOT EXISTS previous_target_id text,
  ADD COLUMN IF NOT EXISTS next_target_type text,
  ADD COLUMN IF NOT EXISTS next_target_id text;

-- Constrain source to known values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'travel_time_logs_source_check'
  ) THEN
    ALTER TABLE public.travel_time_logs
      ADD CONSTRAINT travel_time_logs_source_check
      CHECK (source IN ('gps', 'gap_derived', 'manual'));
  END IF;
END $$;

-- Idempotency: a single staff member cannot have two gap-derived travel
-- logs spanning the exact same interval. Only enforced for gap_derived
-- rows so existing GPS/manual rows are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS travel_time_logs_gap_idempotent_idx
  ON public.travel_time_logs (staff_id, organization_id, start_time, end_time)
  WHERE source = 'gap_derived';

-- Helpful index for "find recent stop for staff today"
CREATE INDEX IF NOT EXISTS travel_time_logs_staff_date_idx
  ON public.travel_time_logs (staff_id, organization_id, report_date);