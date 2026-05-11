
CREATE TABLE IF NOT EXISTS public.staff_day_report_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  date date NOT NULL,
  engine_version text NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_candidate_blocks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_blocks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnostics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_watermark jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_until timestamptz,
  built_at timestamptz NOT NULL DEFAULT now(),
  stale boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_day_report_cache_unique UNIQUE (organization_id, staff_id, date, engine_version)
);

CREATE INDEX IF NOT EXISTS idx_sdrc_org_date ON public.staff_day_report_cache (organization_id, date);
CREATE INDEX IF NOT EXISTS idx_sdrc_org_staff_date ON public.staff_day_report_cache (organization_id, staff_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sdrc_stale ON public.staff_day_report_cache (organization_id, stale) WHERE stale = true;

ALTER TABLE public.staff_day_report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache readable within organization"
ON public.staff_day_report_cache FOR SELECT
USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Writes are restricted to service role / edge functions only.
-- (No INSERT/UPDATE/DELETE policies for authenticated users.)

CREATE TRIGGER trg_sdrc_updated_at
BEFORE UPDATE ON public.staff_day_report_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
