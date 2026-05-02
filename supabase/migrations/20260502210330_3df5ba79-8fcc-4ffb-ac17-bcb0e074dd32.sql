-- Schedule AI auto-stop watchdog every 15 minutes.
-- Idempotent: drop existing job with same name first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workday-ai-auto-stop-15min') THEN
    PERFORM cron.unschedule('workday-ai-auto-stop-15min');
  END IF;
END $$;

SELECT cron.schedule(
  'workday-ai-auto-stop-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/workday-ai-auto-stop',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);