CREATE TABLE IF NOT EXISTS public.day_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  date date NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 600),
  comment text,
  status text NOT NULL DEFAULT 'attested' CHECK (status IN ('attested','locked','revoked')),
  attested_at timestamptz NOT NULL DEFAULT now(),
  attested_by uuid,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_attestations_unique_per_day UNIQUE (organization_id, staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_day_attestations_staff_date ON public.day_attestations (staff_id, date);
CREATE INDEX IF NOT EXISTS idx_day_attestations_org_date ON public.day_attestations (organization_id, date);

ALTER TABLE public.day_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own day attestations"
  ON public.day_attestations FOR SELECT
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY "Staff can insert own day attestations"
  ON public.day_attestations FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update own unlocked day attestations"
  ON public.day_attestations FOR UPDATE
  USING (
    status <> 'locked'
    AND staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can view all day attestations"
  ON public.day_attestations FOR SELECT
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update all day attestations"
  ON public.day_attestations FOR UPDATE
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert day attestations"
  ON public.day_attestations FOR INSERT
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER trg_day_attestations_updated_at
  BEFORE UPDATE ON public.day_attestations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
