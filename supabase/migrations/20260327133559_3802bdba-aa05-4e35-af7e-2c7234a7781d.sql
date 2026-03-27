
-- Persistent booking sync job queue
CREATE TABLE public.booking_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  organization_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  received_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for worker polling and observability
CREATE INDEX idx_sync_jobs_status ON public.booking_sync_jobs (status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sync_jobs_booking ON public.booking_sync_jobs (booking_id);
CREATE INDEX idx_sync_jobs_org ON public.booking_sync_jobs (organization_id);
CREATE INDEX idx_sync_jobs_received ON public.booking_sync_jobs (received_at DESC);

-- RLS: edge functions use service_role, but allow authenticated read for admin UI
ALTER TABLE public.booking_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync jobs"
  ON public.booking_sync_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access"
  ON public.booking_sync_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
