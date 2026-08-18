CREATE TABLE public.booking_cancellation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  booking_number text,
  client text,
  source_revision text,
  source_status text,
  status text NOT NULL DEFAULT 'pending',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_cancellation_candidates_booking_unique UNIQUE (organization_id, booking_id)
);

CREATE INDEX idx_bcc_org_status ON public.booking_cancellation_candidates (organization_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_cancellation_candidates TO authenticated;
GRANT ALL ON public.booking_cancellation_candidates TO service_role;

ALTER TABLE public.booking_cancellation_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_cancellation_candidates"
ON public.booking_cancellation_candidates FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_members_update_cancellation_candidates"
ON public.booking_cancellation_candidates FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER trg_bcc_updated_at
BEFORE UPDATE ON public.booking_cancellation_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();