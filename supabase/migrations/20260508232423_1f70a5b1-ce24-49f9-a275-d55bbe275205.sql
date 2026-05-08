CREATE TABLE IF NOT EXISTS public.time_auto_start_suppressions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  date DATE NOT NULL,
  suppressed_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_auto_start_suppressions_lookup
  ON public.time_auto_start_suppressions (organization_id, staff_id, date, suppressed_until DESC);

ALTER TABLE public.time_auto_start_suppressions ENABLE ROW LEVEL SECURITY;

-- No client access; only service-role (edge functions) reads/writes this table.
CREATE POLICY "No direct client access to time_auto_start_suppressions"
  ON public.time_auto_start_suppressions
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);