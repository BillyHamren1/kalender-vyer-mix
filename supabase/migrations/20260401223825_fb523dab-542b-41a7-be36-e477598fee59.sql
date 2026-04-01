
-- Create organization_locations table
CREATE TABLE public.organization_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create location_time_entries table
CREATE TABLE public.location_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  staff_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES public.organization_locations(id),
  entry_date DATE NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'gps',
  total_minutes INT GENERATED ALWAYS AS (
    CASE WHEN exited_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (exited_at - entered_at))::int / 60 
      ELSE NULL END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_time_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_locations
CREATE POLICY "org_locations_select" ON public.organization_locations
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_locations_insert" ON public.organization_locations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_locations_update" ON public.organization_locations
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_locations_delete" ON public.organization_locations
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- RLS policies for location_time_entries
CREATE POLICY "loc_time_select" ON public.location_time_entries
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "loc_time_insert" ON public.location_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "loc_time_update" ON public.location_time_entries
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Triggers for organization_id auto-fill
CREATE TRIGGER set_organization_id_org_locations
  BEFORE INSERT ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER set_organization_id_loc_time_entries
  BEFORE INSERT ON public.location_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- Updated_at trigger for organization_locations
CREATE TRIGGER update_org_locations_updated_at
  BEFORE UPDATE ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_location_time_entries_staff_location ON public.location_time_entries(staff_id, location_id);
CREATE INDEX idx_location_time_entries_date ON public.location_time_entries(entry_date);
CREATE INDEX idx_org_locations_org_active ON public.organization_locations(organization_id, is_active);
