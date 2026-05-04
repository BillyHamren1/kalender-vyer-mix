-- Privata/exkluderade GPS-zoner per staff. Används för att klassa GPS-kluster
-- som "privat/bakgrund" så de inte hamnar i arbetsjournalen, inte föreslår
-- arbetsdag och inte räknas lönegrundande.
CREATE TABLE public.staff_private_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  organization_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 150,
  -- 'home' = manuellt/inferrad hemadress
  -- 'manual_ignore' = admin/staff har markerat ett kluster som privat
  -- 'recurring_night' = upprepade nattkluster utan arbetskoppling
  kind TEXT NOT NULL CHECK (kind IN ('home', 'manual_ignore', 'recurring_night')),
  label TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'inferred', 'imported')),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_private_zones_staff ON public.staff_private_zones(staff_id) WHERE active;
CREATE INDEX idx_staff_private_zones_org ON public.staff_private_zones(organization_id) WHERE active;

ALTER TABLE public.staff_private_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own private zones"
ON public.staff_private_zones
FOR SELECT
TO authenticated
USING (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
);

CREATE POLICY "Staff can insert own private zones"
ON public.staff_private_zones
FOR INSERT
TO authenticated
WITH CHECK (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
  AND organization_id = public.get_user_organization_id(auth.uid())
);

CREATE POLICY "Staff can update own private zones"
ON public.staff_private_zones
FOR UPDATE
TO authenticated
USING (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
);

CREATE POLICY "Staff can delete own private zones"
ON public.staff_private_zones
FOR DELETE
TO authenticated
USING (
  staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins manage private zones in org"
ON public.staff_private_zones
FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_role('admin'::app_role, auth.uid())
)
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_role('admin'::app_role, auth.uid())
);

CREATE TRIGGER update_staff_private_zones_updated_at
BEFORE UPDATE ON public.staff_private_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.staff_private_zones IS
  'Per-staff private/excluded GPS zones. Clusters within these zones are classified as private_or_background and never enter the work journal or suggest workdays.';