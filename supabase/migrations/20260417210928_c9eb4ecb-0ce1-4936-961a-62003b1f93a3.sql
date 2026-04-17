-- Enable required extensions for cron cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create staff_location_history table
CREATE TABLE IF NOT EXISTS public.staff_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy numeric,
  speed numeric,
  recorded_at timestamptz NOT NULL,
  time_report_id uuid REFERENCES public.time_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes optimized for typical access patterns
CREATE INDEX IF NOT EXISTS idx_slh_recorded_brin
  ON public.staff_location_history USING BRIN(recorded_at);

CREATE INDEX IF NOT EXISTS idx_slh_staff_time
  ON public.staff_location_history (staff_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_slh_report
  ON public.staff_location_history (time_report_id)
  WHERE time_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slh_org_time
  ON public.staff_location_history (organization_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.staff_location_history ENABLE ROW LEVEL SECURITY;

-- Policies: org-scoped read; insert via service role only (edge function)
CREATE POLICY "Org members read own org location history"
  ON public.staff_location_history
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Service role full access location history"
  ON public.staff_location_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-set organization_id if missing on insert
CREATE TRIGGER set_org_id_staff_location_history
  BEFORE INSERT ON public.staff_location_history
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_id();

-- Cleanup function: removes history tied to approved reports (>7d) and orphans (>30d)
CREATE OR REPLACE FUNCTION public.cleanup_staff_location_history()
RETURNS TABLE(approved_deleted bigint, orphans_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _approved_count bigint := 0;
  _orphan_count bigint := 0;
BEGIN
  WITH del AS (
    DELETE FROM public.staff_location_history
    WHERE time_report_id IN (
      SELECT id FROM public.time_reports
      WHERE approved = true AND updated_at < now() - interval '7 days'
    )
    RETURNING 1
  )
  SELECT count(*) INTO _approved_count FROM del;

  WITH del AS (
    DELETE FROM public.staff_location_history
    WHERE time_report_id IS NULL
      AND recorded_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO _orphan_count FROM del;

  RETURN QUERY SELECT _approved_count, _orphan_count;
END;
$$;

-- Schedule nightly cleanup at 03:00 UTC
SELECT cron.schedule(
  'cleanup-staff-location-history',
  '0 3 * * *',
  $$SELECT public.cleanup_staff_location_history();$$
);