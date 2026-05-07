CREATE TABLE public.tracking_boost_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  target_key text NOT NULL,
  reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tbd_active
  ON public.tracking_boost_dismissals (staff_id, target_key, expires_at DESC);

ALTER TABLE public.tracking_boost_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own org dismissals"
ON public.tracking_boost_dismissals FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members insert own org dismissals"
ON public.tracking_boost_dismissals FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.clamp_boost_dismissal_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE max_expiry timestamptz;
BEGIN
  max_expiry := COALESCE(NEW.created_at, now()) + interval '8 hours';
  IF NEW.expires_at IS NULL OR NEW.expires_at > max_expiry THEN
    NEW.expires_at := max_expiry;
  END IF;
  IF NEW.expires_at <= COALESCE(NEW.created_at, now()) THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '1 hour';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_clamp_boost_dismissal_expiry
BEFORE INSERT OR UPDATE ON public.tracking_boost_dismissals
FOR EACH ROW EXECUTE FUNCTION public.clamp_boost_dismissal_expiry();