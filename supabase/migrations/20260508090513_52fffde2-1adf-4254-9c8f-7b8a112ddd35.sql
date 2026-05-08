
-- Time Engine — Time Registration Segments
-- Splits an active_time_registration into work_target / transport / unknown_place / gps_gap segments.
-- ISOLATED from legacy tables (workdays, time_reports, location_time_entries, travel_time_logs).

CREATE TABLE IF NOT EXISTS public.time_registration_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.active_time_registrations(id) ON DELETE CASCADE,
  staff_id text NOT NULL,
  organization_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  kind text NOT NULL CHECK (kind IN ('work_target','transport','unknown_place','gps_gap')),
  label text NOT NULL,
  target_kind text NULL CHECK (target_kind IS NULL OR target_kind IN ('project','booking','warehouse','organization_location')),
  target_ref_id uuid NULL,
  target_key text NULL,
  source_gps_segment_id text NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trs_ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_trs_registration ON public.time_registration_segments(registration_id, started_at);
CREATE INDEX IF NOT EXISTS idx_trs_staff_day ON public.time_registration_segments(organization_id, staff_id, started_at);
-- At most one open segment per registration
CREATE UNIQUE INDEX IF NOT EXISTS uq_trs_one_open_per_registration
  ON public.time_registration_segments(registration_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.time_registration_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trs_org_select"
  ON public.time_registration_segments FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "trs_org_insert"
  ON public.time_registration_segments FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "trs_org_update"
  ON public.time_registration_segments FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "trs_org_delete"
  ON public.time_registration_segments FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_time_registration_segments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trs_set_updated_at ON public.time_registration_segments;
CREATE TRIGGER trg_trs_set_updated_at
  BEFORE UPDATE ON public.time_registration_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_time_registration_segments_updated_at();
