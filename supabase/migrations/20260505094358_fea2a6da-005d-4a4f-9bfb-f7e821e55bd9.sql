
-- Auto-start metadata + cron cursor for server-side geofence engine
ALTER TABLE public.workdays ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.location_time_entries ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Idempotency cursor / dedupe registry for the auto-start engine.
CREATE TABLE IF NOT EXISTS public.location_auto_start_cursor (
  id text PRIMARY KEY,
  last_processed_recorded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.location_auto_start_cursor (id, last_processed_recorded_at)
VALUES ('global', now() - interval '15 minutes')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.location_auto_start_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service-only cursor" ON public.location_auto_start_cursor
  FOR ALL USING (false) WITH CHECK (false);
