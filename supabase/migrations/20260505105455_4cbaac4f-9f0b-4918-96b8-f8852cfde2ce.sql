
CREATE TABLE IF NOT EXISTS public.location_auto_start_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  source_tag TEXT NOT NULL,
  organization_id UUID NULL,
  staff_id UUID NULL,
  date_filter DATE NULL,
  from_iso TIMESTAMPTZ NULL,
  to_iso TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'running',
  staff_count INT NOT NULL DEFAULT 0,
  pings_processed INT NOT NULL DEFAULT 0,
  arrivals INT NOT NULL DEFAULT 0,
  switches INT NOT NULL DEFAULT 0,
  created_workdays INT NOT NULL DEFAULT 0,
  opened_ltes INT NOT NULL DEFAULT 0,
  closed_ltes INT NOT NULL DEFAULT 0,
  created_travel_logs INT NOT NULL DEFAULT 0,
  created_assistant_events INT NOT NULL DEFAULT 0,
  skipped_existing INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_body JSONB NULL,
  plan JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_lasr_started_at ON public.location_auto_start_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lasr_org_started ON public.location_auto_start_runs (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lasr_mode_started ON public.location_auto_start_runs (mode, started_at DESC);

ALTER TABLE public.location_auto_start_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read auto-start runs" ON public.location_auto_start_runs;
CREATE POLICY "Admins read auto-start runs"
ON public.location_auto_start_runs
FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));
