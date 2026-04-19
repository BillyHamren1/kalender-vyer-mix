-- Add classification column to travel_time_logs to semantically separate
-- "billable work travel" from auto-detected assistant signals (e.g. "verkar
-- åka hem"). We DO NOT change historical pay behavior — every existing row
-- is backfilled to 'work' so payroll reports stay identical.
--
-- Future writes:
--   - Manual stop (user explicitly stopped travel)               → 'work'
--   - Auto-stop with destination matched to a booking            → 'work'
--   - Auto-stop without booking match (e.g. driving home)        → 'unclassified'
--   - User chooses "personal" in TravelCompletedDialog           → 'personal'
--
-- Admin reports keep summing hours_worked as today; the column gives admins
-- a way to see and follow up on unclassified auto-logs without breaking
-- existing aggregations.

ALTER TABLE public.travel_time_logs
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'work';

-- Constrain to known values (validation trigger style would be overkill here
-- since the set is finite and immutable).
ALTER TABLE public.travel_time_logs
  DROP CONSTRAINT IF EXISTS travel_time_logs_classification_chk;

ALTER TABLE public.travel_time_logs
  ADD CONSTRAINT travel_time_logs_classification_chk
  CHECK (classification IN ('work', 'personal', 'unclassified'));

-- Helpful index for the admin "show me unclassified travel" query.
CREATE INDEX IF NOT EXISTS travel_time_logs_unclassified_idx
  ON public.travel_time_logs (organization_id, report_date)
  WHERE classification = 'unclassified';

-- Existing rows are explicitly already 'work' due to the DEFAULT applied
-- during ADD COLUMN — no UPDATE needed.

COMMENT ON COLUMN public.travel_time_logs.classification IS
  'Semantic classification of the travel log. ''work'' = billable, ''personal'' = not billable (e.g. commute), ''unclassified'' = auto-detected travel awaiting user/admin classification. Existing rows backfilled to ''work'' to preserve payroll history.';