
-- Tabell: intern bokningsplanering inom ett stort projekt.
-- Isolerad från personalkalenderns tabeller (calendar_events, staff_assignments,
-- booking_staff_assignments, large_project_team_assignments) — inga FK/triggers
-- mot dessa.

CREATE TABLE IF NOT EXISTS public.large_project_booking_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  large_project_id uuid NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  booking_id text NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  parent_item_id uuid NULL REFERENCES public.large_project_booking_plan_items(id) ON DELETE CASCADE,

  item_type text NOT NULL DEFAULT 'task'
    CHECK (item_type IN ('booking','split','manual','task')),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('booking','split','manual')),
  status text NOT NULL DEFAULT 'unplanned'
    CHECK (status IN ('unplanned','planned','in_progress','done','blocked')),

  title text NOT NULL,
  description text NULL,
  notes text NULL,
  phase text NULL,
  source_booking_phase text NULL,

  plan_date date NOT NULL,
  start_time time NULL,
  end_time time NULL,

  assigned_staff_id text NULL REFERENCES public.staff_members(id) ON DELETE SET NULL,
  assigned_team_id text NULL,

  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lpbpi_org              ON public.large_project_booking_plan_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_lpbpi_project          ON public.large_project_booking_plan_items (large_project_id);
CREATE INDEX IF NOT EXISTS idx_lpbpi_booking          ON public.large_project_booking_plan_items (booking_id);
CREATE INDEX IF NOT EXISTS idx_lpbpi_parent           ON public.large_project_booking_plan_items (parent_item_id);
CREATE INDEX IF NOT EXISTS idx_lpbpi_plan_date        ON public.large_project_booking_plan_items (plan_date);
CREATE INDEX IF NOT EXISTS idx_lpbpi_staff            ON public.large_project_booking_plan_items (assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_lpbpi_project_date     ON public.large_project_booking_plan_items (large_project_id, plan_date);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_lpbpi_updated_at ON public.large_project_booking_plan_items;
CREATE TRIGGER trg_lpbpi_updated_at
  BEFORE UPDATE ON public.large_project_booking_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-sätt organization_id från large_projects om klienten inte skickar med det.
CREATE OR REPLACE FUNCTION public.set_lpbpi_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.large_project_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.large_projects
    WHERE id = NEW.large_project_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id kunde inte härledas för large_project_booking_plan_items';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lpbpi_set_org ON public.large_project_booking_plan_items;
CREATE TRIGGER trg_lpbpi_set_org
  BEFORE INSERT ON public.large_project_booking_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lpbpi_organization_id();

-- RLS
ALTER TABLE public.large_project_booking_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpbpi_select_own_org"
  ON public.large_project_booking_plan_items
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpbpi_insert_own_org"
  ON public.large_project_booking_plan_items
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpbpi_update_own_org"
  ON public.large_project_booking_plan_items
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpbpi_delete_own_org"
  ON public.large_project_booking_plan_items
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
