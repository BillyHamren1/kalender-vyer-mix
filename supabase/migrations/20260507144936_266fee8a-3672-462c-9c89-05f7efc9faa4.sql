-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Reschedule location-update-cron with a secret header.
--
-- SECURITY MODEL
-- ──────────────
-- The edge function `location-update-cron` runs with service-role privileges
-- and must never be triggerable by an unauthenticated caller. It now requires
-- ONE of:
--   (a) header `x-cron-secret: <CRON_SECRET>` — used by this scheduled job, or
--   (b) `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — manual ops only.
--
-- The project URL must remain in this SQL because pg_cron has no other way to
-- locate the function. Authentication is moved entirely to the secret header,
-- so the URL alone is not exploitable.
--
-- REQUIRED VAULT SECRET
-- ─────────────────────
-- A Vault entry named `cron_secret` must hold the same value as the edge
-- function secret `CRON_SECRET`. Create it once via the SQL editor:
--   SELECT vault.create_secret('<paste-cron-secret-value>', 'cron_secret');
-- If the Vault secret is missing, this cron will send an empty header and the
-- edge function will respond 401 — by design (fail-closed).

DO $$
BEGIN
  PERFORM cron.unschedule('location-update-cron-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'location-update-cron-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/location-update-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),
        ''
      )
    ),
    body := jsonb_build_object('trigger', 'cron', 'at', now())
  ) AS request_id;
  $cron$
);