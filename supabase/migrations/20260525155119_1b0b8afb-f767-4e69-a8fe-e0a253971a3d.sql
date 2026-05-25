
CREATE TABLE IF NOT EXISTS public.gps_pulse_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  device_token_id UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  fcm_error TEXT,
  delivered_ping_id UUID,
  delivered_at TIMESTAMPTZ,
  lag_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gps_pulse_log_org_sent
  ON public.gps_pulse_log (organization_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_pulse_log_staff_sent
  ON public.gps_pulse_log (staff_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_pulse_log_pending
  ON public.gps_pulse_log (sent_at)
  WHERE delivered_ping_id IS NULL AND success = true;

ALTER TABLE public.gps_pulse_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gps_pulse_log_admin_read"
ON public.gps_pulse_log
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT ur.organization_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','projekt')
  )
);
