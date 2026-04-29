-- Säkerställ tillägg
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Avregistrera tidigare jobb om det finns
DO $$
BEGIN
  PERFORM cron.unschedule('packing-status-cron-every-30-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schemalägg ny cron
SELECT cron.schedule(
  'packing-status-cron-every-30-min',
  '*/30 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/packing-status-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  ) AS request_id;
  $job$
);