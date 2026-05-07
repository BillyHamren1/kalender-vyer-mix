CREATE TABLE IF NOT EXISTS public.current_time_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  organization_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by_user boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  stopped_at timestamptz,
  current_kind text CHECK (current_kind IN ('project', 'booking', 'warehouse', 'transport', 'unknown_place', 'gps_uncertain')),
  current_label text,
  source text NOT NULL DEFAULT 'user_timer' CHECK (source = 'user_timer'),
  confidence numeric,
  needs_user_choice boolean NOT NULL DEFAULT false,
  last_gps_classification_at timestamptz,
  linked_location_time_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS current_time_registration_one_active_per_staff
  ON public.current_time_registration (staff_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS current_time_registration_org_idx
  ON public.current_time_registration (organization_id, status);

CREATE INDEX IF NOT EXISTS current_time_registration_staff_started_idx
  ON public.current_time_registration (staff_id, started_at DESC);

ALTER TABLE public.current_time_registration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read current_time_registration"
ON public.current_time_registration FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_current_time_registration()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_current_time_registration ON public.current_time_registration;
CREATE TRIGGER trg_touch_current_time_registration
BEFORE UPDATE ON public.current_time_registration
FOR EACH ROW EXECUTE FUNCTION public.touch_current_time_registration();