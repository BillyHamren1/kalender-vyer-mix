-- Remove any prior schedule with the same name (safe if absent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-device-tokens-nightly') THEN
    PERFORM cron.unschedule('cleanup-stale-device-tokens-nightly');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-stale-device-tokens-nightly',
  '17 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/cleanup-stale-device-tokens',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  );
  $$
);