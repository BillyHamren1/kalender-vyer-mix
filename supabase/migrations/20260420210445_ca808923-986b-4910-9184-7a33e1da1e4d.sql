CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.staff_inferred_home_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  organization_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 150,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'temporary')),
  cluster_key TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  confidence NUMERIC NOT NULL DEFAULT 0,
  nights_observed INTEGER NOT NULL DEFAULT 1,
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, kind, cluster_key)
);

CREATE INDEX idx_inferred_home_staff ON public.staff_inferred_home_locations(staff_id, kind);
CREATE INDEX idx_inferred_home_org ON public.staff_inferred_home_locations(organization_id);

ALTER TABLE public.staff_inferred_home_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own inferred home"
ON public.staff_inferred_home_locations
FOR SELECT
TO authenticated
USING (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins read inferred home in org"
ON public.staff_inferred_home_locations
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_role('admin'::app_role, auth.uid())
);

CREATE TABLE public.staff_home_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  organization_id UUID NOT NULL,
  observed_date DATE NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  cluster_key TEXT NOT NULL,
  dwell_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, observed_date, cluster_key)
);

CREATE INDEX idx_home_obs_staff_date ON public.staff_home_observations(staff_id, observed_date DESC);

ALTER TABLE public.staff_home_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own home observations"
ON public.staff_home_observations
FOR SELECT
TO authenticated
USING (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
);

CREATE TRIGGER update_inferred_home_updated_at
BEFORE UPDATE ON public.staff_inferred_home_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.staff_inferred_home_locations IS
  'Server-inferred home/sleep locations. Used only as internal trigger for end-of-day suggestion. Never displayed in UI.';