-- 1. Add last_refreshed_at column to device_tokens
ALTER TABLE public.device_tokens
ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_device_tokens_last_refreshed_at
  ON public.device_tokens (last_refreshed_at);

-- 2. Ensure pg_cron + pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;