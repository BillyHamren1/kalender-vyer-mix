
-- A. sync_batches
CREATE TABLE IF NOT EXISTS public.sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sync_type text NOT NULL,
  planned_cursor timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','partial','failed')),
  total_jobs integer NOT NULL DEFAULT 0,
  succeeded_jobs integer NOT NULL DEFAULT 0,
  failed_jobs integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sync_batches TO service_role;

ALTER TABLE public.sync_batches ENABLE ROW LEVEL SECURITY;

-- No end-user access; edge functions run as service_role which bypasses RLS.
CREATE POLICY "sync_batches service role only"
  ON public.sync_batches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_batches_org_type_status
  ON public.sync_batches (organization_id, sync_type, status);

CREATE INDEX IF NOT EXISTS idx_sync_batches_pending
  ON public.sync_batches (started_at DESC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.touch_sync_batches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_batches_touch ON public.sync_batches;
CREATE TRIGGER trg_sync_batches_touch
  BEFORE UPDATE ON public.sync_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_sync_batches_updated_at();

-- B. booking_sync_jobs.batch_id
ALTER TABLE public.booking_sync_jobs
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.sync_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_sync_jobs_batch
  ON public.booking_sync_jobs (batch_id)
  WHERE batch_id IS NOT NULL;

-- C. Re-deduplicate sync_state with success-first priority.
-- The UNIQUE(organization_id, sync_type) constraint already exists.
WITH ranked AS (
  SELECT
    id,
    organization_id,
    sync_type,
    row_number() OVER (
      PARTITION BY organization_id, sync_type
      ORDER BY
        CASE WHEN last_sync_status = 'success' AND last_sync_timestamp IS NOT NULL THEN 0 ELSE 1 END,
        last_sync_timestamp DESC NULLS LAST,
        updated_at DESC NULLS LAST
    ) AS rn
  FROM public.sync_state
)
DELETE FROM public.sync_state s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;
