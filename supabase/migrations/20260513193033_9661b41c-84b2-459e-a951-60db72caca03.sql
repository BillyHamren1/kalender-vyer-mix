
CREATE TABLE IF NOT EXISTS public.auto_start_decline_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  declined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  local_date DATE NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_m INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  day_scope BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'user_arrival_prompt',
  response TEXT NOT NULL DEFAULT 'declined',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_start_decline_log_lookup
  ON public.auto_start_decline_log (organization_id, staff_id, local_date, expires_at);

CREATE INDEX IF NOT EXISTS idx_auto_start_decline_log_target
  ON public.auto_start_decline_log (organization_id, staff_id, target_type, target_id)
  WHERE target_id IS NOT NULL;

ALTER TABLE public.auto_start_decline_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own decline log"
  ON public.auto_start_decline_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
