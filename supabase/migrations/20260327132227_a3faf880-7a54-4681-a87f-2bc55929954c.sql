CREATE TABLE public.sync_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sync_action text NOT NULL,
  booking_status text,
  booking_dates jsonb,
  expected_events jsonb,
  actual_events jsonb,
  events_created integer DEFAULT 0,
  events_updated integer DEFAULT 0,
  events_deleted integer DEFAULT 0,
  has_mismatch boolean DEFAULT false,
  mismatch_details text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_audit_log_booking ON public.sync_audit_log(booking_id);
CREATE INDEX idx_sync_audit_log_org_created ON public.sync_audit_log(organization_id, created_at DESC);
CREATE INDEX idx_sync_audit_log_mismatch ON public.sync_audit_log(has_mismatch) WHERE has_mismatch = true;

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their org"
  ON public.sync_audit_log FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));