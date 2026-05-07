CREATE TABLE public.tracking_policy_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('clarification_boost','near_target','approaching_target')),
  reason text NOT NULL,
  target_id text,
  target_type text,
  requested_by text NOT NULL CHECK (requested_by IN ('rule_engine','ai','admin','system')),
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tpb_active ON public.tracking_policy_boosts (staff_id, expires_at DESC)
  WHERE consumed = false;
CREATE INDEX idx_tpb_org ON public.tracking_policy_boosts (organization_id, created_at DESC);

ALTER TABLE public.tracking_policy_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_own_boosts"
ON public.tracking_policy_boosts
FOR SELECT
TO authenticated
USING (
  staff_id::text IN (
    SELECT id::text FROM public.staff_members WHERE user_id::text = auth.uid()::text
  )
);

CREATE POLICY "planning_roles_read_boosts"
ON public.tracking_policy_boosts
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);

CREATE POLICY "service_role_manages_boosts"
ON public.tracking_policy_boosts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Enforce max 5 min boost
CREATE OR REPLACE FUNCTION public.clamp_tracking_boost_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  max_expiry timestamptz;
BEGIN
  max_expiry := COALESCE(NEW.created_at, now()) + interval '5 minutes';
  IF NEW.expires_at IS NULL OR NEW.expires_at > max_expiry THEN
    NEW.expires_at := max_expiry;
  END IF;
  IF NEW.expires_at <= COALESCE(NEW.created_at, now()) THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '3 minutes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clamp_tracking_boost_expiry
BEFORE INSERT OR UPDATE ON public.tracking_policy_boosts
FOR EACH ROW EXECUTE FUNCTION public.clamp_tracking_boost_expiry();