-- ============================================================
-- Workdays: dedikerad source-of-truth för "arbetsdagen pågår"
-- ============================================================
-- Workday är PRIMÄR. Activity-pass (time_reports, location_time_entries)
-- är SEKUNDÄRA detaljpass och får aldrig styra om en arbetsdag är aktiv.
-- En staff kan ha exakt en öppen workday åt gången (ended_at IS NULL).

CREATE TABLE IF NOT EXISTS public.workdays (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        text NOT NULL,
  organization_id uuid NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  started_by      text NOT NULL DEFAULT 'manual',  -- manual | auto_activity | recovery
  ended_by        text,                             -- manual | admin | auto_midnight
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Endast EN öppen workday per staff. Hela poängen.
CREATE UNIQUE INDEX IF NOT EXISTS workdays_one_open_per_staff
  ON public.workdays (staff_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS workdays_org_started_idx
  ON public.workdays (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS workdays_staff_started_idx
  ON public.workdays (staff_id, started_at DESC);

-- Auto-fyll organization_id om saknas (samma mönster som övriga tabeller)
DROP TRIGGER IF EXISTS set_org_id_workdays ON public.workdays;
CREATE TRIGGER set_org_id_workdays
  BEFORE INSERT ON public.workdays
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS update_workdays_updated_at ON public.workdays;
CREATE TRIGGER update_workdays_updated_at
  BEFORE UPDATE ON public.workdays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS: staff ser sina egna, admin ser hela orgen
-- ============================================================
ALTER TABLE public.workdays ENABLE ROW LEVEL SECURITY;

-- Admins (samma org) får läsa allt
CREATE POLICY "workdays_admin_select"
  ON public.workdays FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin'::app_role)
  );

-- Admins får uppdatera (t.ex. avsluta åt en glömsk användare)
CREATE POLICY "workdays_admin_update"
  ON public.workdays FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin'::app_role)
  );

-- Service role (edge functions) hanterar staff-skrivningar via mobile-app-api
-- som auktoriserar mot staff_id. Ingen anonym INSERT.
CREATE POLICY "workdays_service_all"
  ON public.workdays FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- workday_flags: lägg till ny flag-typ för EOD-korrigering
-- ============================================================
-- 'open_segment_at_workday_end' = workday avslutades men ett activity-pass
-- var fortfarande öppet. Användaren/admin behöver korrigera segmentet i
-- efterhand. Detta ersätter den gamla EOD-tvångskön.
COMMENT ON TABLE public.workdays IS
  'Workday = primary source of truth for "the user is working today". '
  'One open row per staff (ended_at IS NULL). Activity timers '
  '(time_reports, location_time_entries) are SECONDARY and may not '
  'control workday lifecycle.';