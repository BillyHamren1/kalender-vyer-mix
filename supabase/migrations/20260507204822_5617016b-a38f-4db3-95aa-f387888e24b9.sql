CREATE TABLE public.active_time_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','stopped')),
  started_at timestamptz NOT NULL,
  stopped_at timestamptz NULL,
  start_source text NOT NULL,
  stop_source text NULL,
  started_by uuid NULL,
  stopped_by uuid NULL,
  auto_started boolean NOT NULL DEFAULT false,
  start_target_type text NULL,
  start_target_id uuid NULL,
  start_target_label text NULL,
  current_kind text NULL,
  current_label text NULL,
  current_target_type text NULL,
  current_target_id uuid NULL,
  current_confidence numeric NULL,
  needs_user_choice boolean NOT NULL DEFAULT false,
  manual_override_kind text NULL,
  manual_override_label text NULL,
  manual_override_target_type text NULL,
  manual_override_target_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_atr_org_staff_status
  ON public.active_time_registrations (organization_id, staff_id, status);

CREATE UNIQUE INDEX uniq_atr_one_active_per_staff_org
  ON public.active_time_registrations (organization_id, staff_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.set_active_time_registrations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atr_updated_at
BEFORE UPDATE ON public.active_time_registrations
FOR EACH ROW
EXECUTE FUNCTION public.set_active_time_registrations_updated_at();

ALTER TABLE public.active_time_registrations ENABLE ROW LEVEL SECURITY;

-- Members of the same organization (resolved via profiles.organization_id) can read.
CREATE POLICY "atr_select_same_org"
ON public.active_time_registrations
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT p.organization_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
  )
);

-- No INSERT/UPDATE/DELETE policy for authenticated users — writes go through
-- edge functions running with the service role.