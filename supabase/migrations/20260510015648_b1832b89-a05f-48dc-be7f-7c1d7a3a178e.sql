
-- warehouse_assignments: per-person concrete warehouse tasks for the Time-app Lager view.
-- Safe migration: create table only if missing, otherwise add any missing columns/indexes.

CREATE TABLE IF NOT EXISTS public.warehouse_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  assignment_date date NOT NULL,
  assignment_type text NOT NULL,
  action text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planned',
  start_time time,
  end_time time,
  warehouse_event_id uuid,
  packing_id uuid,
  packlist_id uuid,
  booking_id uuid,
  booking_number text,
  delivery_address text,
  customer_name text,
  project_task_id uuid,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Defensive: add any columns that may be missing on a pre-existing table
ALTER TABLE public.warehouse_assignments
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS assignment_date date,
  ADD COLUMN IF NOT EXISTS assignment_type text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS warehouse_event_id uuid,
  ADD COLUMN IF NOT EXISTS packing_id uuid,
  ADD COLUMN IF NOT EXISTS packlist_id uuid,
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS booking_number text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS project_task_id uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_org
  ON public.warehouse_assignments (organization_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_staff
  ON public.warehouse_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_date
  ON public.warehouse_assignments (assignment_date);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_staff_date
  ON public.warehouse_assignments (staff_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_type
  ON public.warehouse_assignments (assignment_type);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_warehouse_event
  ON public.warehouse_assignments (warehouse_event_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_packing
  ON public.warehouse_assignments (packing_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_booking
  ON public.warehouse_assignments (booking_id);

-- Auto-fill organization_id from auth context if omitted (matches existing pattern)
DROP TRIGGER IF EXISTS set_organization_id_warehouse_assignments
  ON public.warehouse_assignments;
CREATE TRIGGER set_organization_id_warehouse_assignments
  BEFORE INSERT ON public.warehouse_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- updated_at maintenance
DROP TRIGGER IF EXISTS update_warehouse_assignments_updated_at
  ON public.warehouse_assignments;
CREATE TRIGGER update_warehouse_assignments_updated_at
  BEFORE UPDATE ON public.warehouse_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: same pattern as warehouse_calendar_events
ALTER TABLE public.warehouse_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access warehouse_assignments"
  ON public.warehouse_assignments;
CREATE POLICY "Authenticated users can access warehouse_assignments"
  ON public.warehouse_assignments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "org_filter_warehouse_assignments"
  ON public.warehouse_assignments;
CREATE POLICY "org_filter_warehouse_assignments"
  ON public.warehouse_assignments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
