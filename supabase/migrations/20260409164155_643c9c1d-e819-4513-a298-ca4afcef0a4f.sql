
-- New join table: links multiple bookings to one packing project
CREATE TABLE public.packing_project_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  booking_id text NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(packing_id, booking_id)
);

-- RLS
ALTER TABLE public.packing_project_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org packing_project_bookings"
  ON public.packing_project_bookings FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert own org packing_project_bookings"
  ON public.packing_project_bookings FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete own org packing_project_bookings"
  ON public.packing_project_bookings FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Add large_project_id to packing_projects
ALTER TABLE public.packing_projects
  ADD COLUMN large_project_id uuid REFERENCES public.large_projects(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX idx_packing_project_bookings_packing_id ON public.packing_project_bookings(packing_id);
CREATE INDEX idx_packing_project_bookings_booking_id ON public.packing_project_bookings(booking_id);
CREATE INDEX idx_packing_projects_large_project_id ON public.packing_projects(large_project_id);

-- Set org trigger
CREATE TRIGGER set_packing_project_bookings_org
  BEFORE INSERT ON public.packing_project_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_id();
