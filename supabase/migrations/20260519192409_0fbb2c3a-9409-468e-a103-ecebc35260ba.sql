
-- 1. Extend staff_day_submissions: add start_time/end_time + new statuses + org-scoped unique
ALTER TABLE public.staff_day_submissions
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

-- Replace status check constraint to allow needs_control + payroll_approved
DO $$
DECLARE
  cn text;
BEGIN
  SELECT conname INTO cn
  FROM pg_constraint
  WHERE conrelid = 'public.staff_day_submissions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.staff_day_submissions DROP CONSTRAINT %I', cn);
  END IF;
END $$;

ALTER TABLE public.staff_day_submissions
  ADD CONSTRAINT staff_day_submissions_status_check
  CHECK (status IN ('submitted','approved','rejected','correction_requested','withdrawn','needs_control','payroll_approved'));

-- Org-scoped unique (drop legacy staff_id+date unique if present, add org+staff+date)
DO $$
DECLARE
  cn text;
BEGIN
  SELECT conname INTO cn
  FROM pg_constraint
  WHERE conrelid = 'public.staff_day_submissions'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (staff_id, date)';
  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.staff_day_submissions DROP CONSTRAINT %I', cn);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_day_submissions_org_staff_date
  ON public.staff_day_submissions (organization_id, staff_id, date);

CREATE INDEX IF NOT EXISTS idx_staff_day_submissions_org_status
  ON public.staff_day_submissions (organization_id, status);

-- Admin/projekt may update status (RLS UPDATE)
DROP POLICY IF EXISTS "Admin can update day submissions" ON public.staff_day_submissions;
CREATE POLICY "Admin can update day submissions"
  ON public.staff_day_submissions
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  );

-- 2. staff_payroll_periods
CREATE TABLE IF NOT EXISTS public.staff_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved_for_payout')),
  approved_for_payout_at timestamptz,
  approved_for_payout_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_staff_payroll_periods_org_range
  ON public.staff_payroll_periods (organization_id, period_start, period_end);

ALTER TABLE public.staff_payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Periods readable within organization" ON public.staff_payroll_periods;
CREATE POLICY "Periods readable within organization"
  ON public.staff_payroll_periods
  FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Admin can manage payroll periods" ON public.staff_payroll_periods;
CREATE POLICY "Admin can manage payroll periods"
  ON public.staff_payroll_periods
  FOR ALL
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  );

CREATE OR REPLACE FUNCTION public.tg_staff_payroll_periods_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_staff_payroll_periods_updated_at ON public.staff_payroll_periods;
CREATE TRIGGER trg_staff_payroll_periods_updated_at
  BEFORE UPDATE ON public.staff_payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_staff_payroll_periods_set_updated_at();

-- 3. staff_payroll_period_days
CREATE TABLE IF NOT EXISTS public.staff_payroll_period_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL REFERENCES public.staff_payroll_periods(id) ON DELETE CASCADE,
  day_submission_id uuid NOT NULL REFERENCES public.staff_day_submissions(id) ON DELETE CASCADE,
  staff_id text NOT NULL,
  report_date date NOT NULL,
  included_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id, day_submission_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_payroll_period_days_period
  ON public.staff_payroll_period_days (payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_staff_payroll_period_days_staff_date
  ON public.staff_payroll_period_days (organization_id, staff_id, report_date);

ALTER TABLE public.staff_payroll_period_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Period days readable within organization" ON public.staff_payroll_period_days;
CREATE POLICY "Period days readable within organization"
  ON public.staff_payroll_period_days
  FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Admin can manage period days" ON public.staff_payroll_period_days;
CREATE POLICY "Admin can manage period days"
  ON public.staff_payroll_period_days
  FOR ALL
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.has_role('admin') OR public.has_role('projekt'))
  );
