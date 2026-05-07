-- Audit log for backend-initiated GPS wake requests.
-- Used for cooldown enforcement and admin visibility.
CREATE TABLE IF NOT EXISTS public.staff_wake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  reason text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'location-update-cron',
  dispatch_status text,
  silence_ms bigint,
  context jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_staff_wake_requests_staff_recent
  ON public.staff_wake_requests (staff_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_wake_requests_org_recent
  ON public.staff_wake_requests (organization_id, requested_at DESC);

ALTER TABLE public.staff_wake_requests ENABLE ROW LEVEL SECURITY;

-- Admins in the same org can read the audit log.
CREATE POLICY "Org members can read wake requests"
ON public.staff_wake_requests
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

-- Inserts are made by the service role (edge functions) only.
-- No INSERT policy → PostgREST clients cannot write directly.
