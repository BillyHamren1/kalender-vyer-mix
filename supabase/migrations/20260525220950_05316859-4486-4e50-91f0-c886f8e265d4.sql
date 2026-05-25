
CREATE TABLE IF NOT EXISTS public.project_staff_time_cost_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_day_submission_id uuid not null references public.staff_day_submissions(id) on delete cascade,
  staff_id text not null,
  staff_name text null,
  date date not null,

  booking_id uuid null,
  project_id uuid null,
  large_project_id uuid null,
  assignment_id uuid null,
  location_id uuid null,

  source_block_id text null,
  source_block_kind text null,
  source_label text null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  minutes integer not null,
  hours numeric not null,

  hourly_rate numeric not null default 0,
  cost numeric not null default 0,
  rate_source text null,

  submission_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  CONSTRAINT project_staff_time_cost_lines_minutes_positive CHECK (minutes > 0),
  CONSTRAINT project_staff_time_cost_lines_time_range CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_pstcl_org_booking ON public.project_staff_time_cost_lines(organization_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_pstcl_org_project ON public.project_staff_time_cost_lines(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_pstcl_org_large_project ON public.project_staff_time_cost_lines(organization_id, large_project_id);
CREATE INDEX IF NOT EXISTS idx_pstcl_org_staff_date ON public.project_staff_time_cost_lines(organization_id, staff_id, date);
CREATE INDEX IF NOT EXISTS idx_pstcl_submission ON public.project_staff_time_cost_lines(staff_day_submission_id);
CREATE INDEX IF NOT EXISTS idx_pstcl_org_date ON public.project_staff_time_cost_lines(organization_id, date);

ALTER TABLE public.project_staff_time_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project staff time cost lines"
ON public.project_staff_time_cost_lines
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- No INSERT/UPDATE/DELETE policies: only service_role (edge functions) writes.

CREATE OR REPLACE FUNCTION public.update_pstcl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pstcl_updated_at
BEFORE UPDATE ON public.project_staff_time_cost_lines
FOR EACH ROW EXECUTE FUNCTION public.update_pstcl_updated_at();
