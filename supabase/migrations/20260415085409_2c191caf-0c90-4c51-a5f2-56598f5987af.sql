-- Warehouse staff activation table
CREATE TABLE public.warehouse_staff_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  organization_id uuid NOT NULL DEFAULT (get_user_organization_id(auth.uid())),
  activation_type text NOT NULL CHECK (activation_type IN ('permanent', 'temporary')),
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.warehouse_staff_activations ENABLE ROW LEVEL SECURITY;

-- RLS: users with planning access can read
CREATE POLICY "Planning users can view warehouse activations"
  ON public.warehouse_staff_activations FOR SELECT
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- RLS: users with planning access can insert
CREATE POLICY "Planning users can insert warehouse activations"
  ON public.warehouse_staff_activations FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND has_planning_access(auth.uid()));

-- RLS: users with planning access can update
CREATE POLICY "Planning users can update warehouse activations"
  ON public.warehouse_staff_activations FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_planning_access(auth.uid()));

-- RLS: users with planning access can delete
CREATE POLICY "Planning users can delete warehouse activations"
  ON public.warehouse_staff_activations FOR DELETE
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()) AND has_planning_access(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_warehouse_staff_activations_updated_at
  BEFORE UPDATE ON public.warehouse_staff_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_warehouse_staff_activations_org ON public.warehouse_staff_activations (organization_id);
CREATE INDEX idx_warehouse_staff_activations_staff ON public.warehouse_staff_activations (staff_id);
