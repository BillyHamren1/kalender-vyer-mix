-- ───────────────────────────────────────────────────────────────────────────
-- Day Event Timeline Engine — Stage 1
-- Persisterade händelser, förslag och cache-metadata per personal/dag.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. day_timeline_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.day_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  date date NOT NULL,
  event_type text NOT NULL,
  -- workday_started | workday_ended | timer_started | timer_stopped
  -- arrived_at_reported_site | left_reported_site
  -- arrived_at_known_location | left_known_location
  -- stopped_at_unknown_location | movement_started | movement_ended
  -- gps_gap_started | gps_gap_ended | stale_phone_detected | report_mismatch_detected
  ts timestamptz NOT NULL,
  lat numeric,
  lng numeric,
  accuracy numeric,
  source text,
  matched_site_id text,
  matched_site_type text, -- booking | project | location | home | unknown
  matched_site_name text,
  distance_to_reported_site_m numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  human_readable_text text NOT NULL,
  related_time_report_id uuid,
  related_workday_id uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  engine_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_dte_staff_date ON public.day_timeline_events (staff_id, date);
CREATE INDEX IF NOT EXISTS idx_dte_org_date   ON public.day_timeline_events (organization_id, date);
CREATE INDEX IF NOT EXISTS idx_dte_ts         ON public.day_timeline_events (staff_id, date, ts);

ALTER TABLE public.day_timeline_events ENABLE ROW LEVEL SECURITY;

-- Admins/projektledare i samma org får läsa allt.
CREATE POLICY "dte_admin_read"
  ON public.day_timeline_events FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_planning_access(auth.uid())
  );

-- Personal får läsa sina egna events (matcha via staff_members.user_id).
CREATE POLICY "dte_self_read"
  ON public.day_timeline_events FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = day_timeline_events.staff_id
        AND sm.user_id = auth.uid()
    )
  );

-- Inga client-writes — bara service_role (edge function) skriver.
-- (RLS default: deny.)


-- 2. time_report_correction_suggestions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_report_correction_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  time_report_id uuid NOT NULL,
  suggestion_type text NOT NULL,
  -- shorten_end | shift_start | move_to_other_site | mark_as_travel | mark_as_unclear | split
  report_date date NOT NULL,
  suggested_start_time time,
  suggested_end_time time,
  suggested_duration_min integer,
  original_start_time time,
  original_end_time time,
  difference_min integer,
  target_booking_id text,
  target_project_id uuid,
  target_location_id uuid,
  reason text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  human_readable_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | ignored | superseded | expired
  resolved_by text,
  resolved_at timestamptz,
  resolved_action text,
  resolution_payload jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  engine_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_trcs_staff_date ON public.time_report_correction_suggestions (staff_id, report_date);
CREATE INDEX IF NOT EXISTS idx_trcs_org_date   ON public.time_report_correction_suggestions (organization_id, report_date);
CREATE INDEX IF NOT EXISTS idx_trcs_report     ON public.time_report_correction_suggestions (time_report_id);
CREATE INDEX IF NOT EXISTS idx_trcs_status     ON public.time_report_correction_suggestions (organization_id, status);

ALTER TABLE public.time_report_correction_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trcs_admin_read"
  ON public.time_report_correction_suggestions FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_planning_access(auth.uid())
  );

CREATE POLICY "trcs_self_read"
  ON public.time_report_correction_suggestions FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = time_report_correction_suggestions.staff_id
        AND sm.user_id = auth.uid()
    )
  );

-- Admins får uppdatera status (resolve_suggestion gör det via service_role,
-- men vi tillåter även direkt admin-update för framtida UI-utbyggnad).
CREATE POLICY "trcs_admin_update"
  ON public.time_report_correction_suggestions FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin', auth.uid())
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin', auth.uid())
  );


-- 3. day_timeline_snapshots ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.day_timeline_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  date date NOT NULL,
  last_computed_at timestamptz,
  input_signature text,
  engine_version text NOT NULL DEFAULT 'v1',
  event_count integer NOT NULL DEFAULT 0,
  suggestion_count integer NOT NULL DEFAULT 0,
  is_dirty boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_timeline_snapshots_unique UNIQUE (staff_id, date, engine_version)
);

CREATE INDEX IF NOT EXISTS idx_dts_org_date  ON public.day_timeline_snapshots (organization_id, date);
CREATE INDEX IF NOT EXISTS idx_dts_dirty     ON public.day_timeline_snapshots (organization_id, is_dirty) WHERE is_dirty = true;

ALTER TABLE public.day_timeline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dts_admin_read"
  ON public.day_timeline_snapshots FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_planning_access(auth.uid())
  );

CREATE POLICY "dts_self_read"
  ON public.day_timeline_snapshots FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = day_timeline_snapshots.staff_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_dts_updated_at
  BEFORE UPDATE ON public.day_timeline_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4. Cache-invalidering: triggers som markerar snapshot som dirty ─────────
CREATE OR REPLACE FUNCTION public.mark_day_timeline_dirty(_staff_id text, _date date, _org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _staff_id IS NULL OR _date IS NULL OR _org_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.day_timeline_snapshots (organization_id, staff_id, date, is_dirty, last_computed_at)
  VALUES (_org_id, _staff_id, _date, true, NULL)
  ON CONFLICT (staff_id, date, engine_version) DO UPDATE
    SET is_dirty = true, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.dirty_day_timeline_from_location_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mark_day_timeline_dirty(
    NEW.staff_id,
    (NEW.recorded_at AT TIME ZONE 'Europe/Stockholm')::date,
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dirty_day_timeline_from_time_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  _row := COALESCE(NEW, OLD);
  PERFORM public.mark_day_timeline_dirty(_row.staff_id, _row.report_date, _row.organization_id);
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.dirty_day_timeline_from_location_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  _row := COALESCE(NEW, OLD);
  PERFORM public.mark_day_timeline_dirty(_row.staff_id, _row.entry_date, _row.organization_id);
  RETURN _row;
END;
$$;

DROP TRIGGER IF EXISTS trg_dirty_dte_history ON public.staff_location_history;
CREATE TRIGGER trg_dirty_dte_history
  AFTER INSERT ON public.staff_location_history
  FOR EACH ROW EXECUTE FUNCTION public.dirty_day_timeline_from_location_history();

DROP TRIGGER IF EXISTS trg_dirty_dte_reports ON public.time_reports;
CREATE TRIGGER trg_dirty_dte_reports
  AFTER INSERT OR UPDATE OR DELETE ON public.time_reports
  FOR EACH ROW EXECUTE FUNCTION public.dirty_day_timeline_from_time_reports();

DROP TRIGGER IF EXISTS trg_dirty_dte_entries ON public.location_time_entries;
CREATE TRIGGER trg_dirty_dte_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.location_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.dirty_day_timeline_from_location_entries();